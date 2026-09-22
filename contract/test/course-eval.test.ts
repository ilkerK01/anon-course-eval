import { describe, it, expect, beforeEach } from 'vitest';
import { Phase } from '../managed/course-eval/contract/index.js';
import { CourseEvalSimulator, randomKey } from './course-eval-simulator.js';

describe('course evaluation contract', () => {
  let instructor: Uint8Array;
  let alice: Uint8Array;
  let bob: Uint8Array;
  let sim: CourseEvalSimulator;

  beforeEach(() => {
    instructor = randomKey();
    alice = randomKey();
    bob = randomKey();
    sim = new CourseEvalSimulator(instructor, 'CENG-301');
  });

  const enrollAll = (...students: Uint8Array[]) => {
    sim.as(instructor);
    for (const s of students) sim.enroll(CourseEvalSimulator.commitmentOf(s));
  };

  it('starts in enrollment with an empty tally', () => {
    const state = sim.ledger();
    expect(state.phase).toBe(Phase.ENROLLMENT);
    expect(state.enrolled).toBe(0n);
    expect(state.responses).toBe(0n);
    expect(new TextDecoder().decode(state.courseCode).replace(/\0/g, '')).toBe('CENG-301');
  });

  it('lets only the instructor enroll students', () => {
    enrollAll(alice);
    expect(sim.ledger().enrolled).toBe(1n);
    sim.as(alice);
    expect(() => sim.enroll(CourseEvalSimulator.commitmentOf(bob))).toThrow(/only the instructor/);
  });

  it('refuses to enroll the same code twice', () => {
    enrollAll(alice);
    expect(() => sim.enroll(CourseEvalSimulator.commitmentOf(alice))).toThrow(/already on the roster/);
    expect(sim.ledger().enrolled).toBe(1n);
  });

  it('lets a student who enrolled early rate after many later enrollments', () => {
    enrollAll(alice, ...Array.from({ length: 12 }, randomKey));
    sim.as(instructor).openEvaluation();
    expect(sim.as(alice).submitRating(3).responses).toBe(1n);
  });

  it('refuses to open an evaluation with no students', () => {
    sim.as(instructor);
    expect(() => sim.openEvaluation()).toThrow(/no students enrolled/);
  });

  it('refuses ratings before the evaluation is open', () => {
    enrollAll(alice);
    sim.as(alice);
    expect(() => sim.submitRating(4)).toThrow(/not open/);
  });

  it('records an anonymous rating from an enrolled student', () => {
    enrollAll(alice, bob);
    sim.as(instructor).openEvaluation();
    const state = sim.as(alice).submitRating(4);
    expect(state.responses).toBe(1n);
    expect(state.ratingTotal).toBe(4n);
    expect(state.fourStar).toBe(1n);
    expect(state.nullifiers.size()).toBe(1n);
  });

  it('never stores who submitted a rating', () => {
    enrollAll(alice, bob);
    sim.as(instructor).openEvaluation();
    const state = sim.as(alice).submitRating(5);
    const commitment = CourseEvalSimulator.commitmentOf(alice);
    for (const n of state.nullifiers) {
      expect(Buffer.from(n).equals(Buffer.from(commitment))).toBe(false);
    }
  });

  it('blocks a second rating from the same student', () => {
    enrollAll(alice);
    sim.as(instructor).openEvaluation();
    sim.as(alice).submitRating(3);
    expect(() => sim.as(alice).submitRating(1)).toThrow(/already evaluated/);
    expect(sim.ledger().responses).toBe(1n);
  });

  it('rejects students who are not on the roster', () => {
    enrollAll(alice);
    sim.as(instructor).openEvaluation();
    const outsider = randomKey();
    expect(() => sim.as(outsider).submitRating(5)).toThrow(/not on this course roster/);
  });

  it('rejects ratings outside 1 to 5', () => {
    enrollAll(alice);
    sim.as(instructor).openEvaluation();
    expect(() => sim.as(alice).submitRating(0)).toThrow(/between 1 and 5/);
    expect(() => sim.as(alice).submitRating(6)).toThrow(/between 1 and 5/);
  });

  it('builds the distribution across many students', () => {
    const students = Array.from({ length: 5 }, randomKey);
    enrollAll(...students);
    sim.as(instructor).openEvaluation();
    [5, 4, 4, 2, 5].forEach((r, i) => sim.as(students[i]).submitRating(r));
    const state = sim.ledger();
    expect(state.responses).toBe(5n);
    expect(state.ratingTotal).toBe(20n);
    expect([state.oneStar, state.twoStar, state.threeStar, state.fourStar, state.fiveStar]).toEqual([0n, 1n, 0n, 2n, 2n]);
  });

  it('closes the evaluation and stops accepting ratings', () => {
    enrollAll(alice, bob);
    sim.as(instructor).openEvaluation();
    sim.as(alice).submitRating(5);
    sim.as(instructor).closeEvaluation();
    expect(sim.ledger().phase).toBe(Phase.CLOSED);
    expect(() => sim.as(bob).submitRating(4)).toThrow(/not open/);
  });

  it('stops enrollment once the evaluation is open', () => {
    enrollAll(alice);
    sim.as(instructor).openEvaluation();
    sim.as(instructor);
    expect(() => sim.enroll(CourseEvalSimulator.commitmentOf(bob))).toThrow(/enrollment is closed/);
  });
});
