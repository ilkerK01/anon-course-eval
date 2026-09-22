import type { WitnessContext, MerkleTreePath } from '@midnight-ntwrk/compact-runtime';
import type { Ledger } from '../managed/course-eval/contract/index.js';

export type CourseEvalPrivateState = {
  readonly secretKey: Uint8Array;
};

export const createCourseEvalPrivateState = (secretKey: Uint8Array): CourseEvalPrivateState => ({
  secretKey,
});

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, CourseEvalPrivateState>): [CourseEvalPrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
  findRosterPath: (
    { ledger, privateState }: WitnessContext<Ledger, CourseEvalPrivateState>,
    leaf: Uint8Array,
  ): [CourseEvalPrivateState, MerkleTreePath<Uint8Array>] => {
    const path = ledger.roster.findPathForLeaf(leaf);
    if (!path) {
      throw new Error('Your enrollment code is not on this course roster');
    }
    return [privateState, path];
  },
};
