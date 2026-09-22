import {
  type CircuitContext,
  sampleContractAddress,
  createConstructorContext,
  createCircuitContext,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, type Ledger, ledger, pureCircuits } from '../managed/course-eval/contract/index.js';
import { type CourseEvalPrivateState, createCourseEvalPrivateState, witnesses } from '../src/witnesses.js';

export const bytes32 = (text: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(text).slice(0, 32));
  return out;
};

export const randomKey = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));

export class CourseEvalSimulator {
  readonly contract: Contract<CourseEvalPrivateState>;
  circuitContext: CircuitContext<CourseEvalPrivateState>;

  constructor(instructorKey: Uint8Array, courseCode: string) {
    this.contract = new Contract<CourseEvalPrivateState>(witnesses);
    const { currentPrivateState, currentContractState, currentZswapLocalState } = this.contract.initialState(
      createConstructorContext(createCourseEvalPrivateState(instructorKey), '0'.repeat(64)),
      bytes32(courseCode),
    );
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  as(secretKey: Uint8Array): this {
    this.circuitContext = { ...this.circuitContext, currentPrivateState: createCourseEvalPrivateState(secretKey) };
    return this;
  }

  ledger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  static commitmentOf(secretKey: Uint8Array): Uint8Array {
    return pureCircuits.studentCommitment(secretKey);
  }

  enroll(commitment: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.enroll(this.circuitContext, commitment).context;
    return this.ledger();
  }

  openEvaluation(): Ledger {
    this.circuitContext = this.contract.impureCircuits.openEvaluation(this.circuitContext).context;
    return this.ledger();
  }

  closeEvaluation(): Ledger {
    this.circuitContext = this.contract.impureCircuits.closeEvaluation(this.circuitContext).context;
    return this.ledger();
  }

  submitRating(rating: number): Ledger {
    this.circuitContext = this.contract.impureCircuits.submitRating(this.circuitContext, BigInt(rating)).context;
    return this.ledger();
  }
}
