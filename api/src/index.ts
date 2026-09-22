import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { map, type Observable } from 'rxjs';
import {
  CourseEval,
  CompiledCourseEvalContract,
  createCourseEvalPrivateState,
  type CourseEvalPrivateState,
} from '../../contract/src/index';

export const privateStateKey = 'courseEvalPrivateState';
export type PrivateStateId = typeof privateStateKey;
export type CourseEvalCircuitKeys = 'enroll' | 'openEvaluation' | 'closeEvaluation' | 'submitRating';
export type CourseEvalProviders = MidnightProviders<CourseEvalCircuitKeys, PrivateStateId, CourseEvalPrivateState>;

export type Phase = 'enrollment' | 'open' | 'closed';

export interface CourseState {
  readonly courseCode: string;
  readonly phase: Phase;
  readonly enrolled: number;
  readonly responses: number;
  readonly average: number | null;
  readonly distribution: readonly [number, number, number, number, number];
  readonly instructorKey: string;
}

export const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string): Uint8Array => {
  const clean = hex.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error('Expected 64 hex characters');
  return Uint8Array.from(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
};

export const encodeCourseCode = (code: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(code.trim()).slice(0, 32));
  return out;
};

export const decodeCourseCode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes).replace(/\0+$/g, '');

export const studentCommitment = (secretKey: Uint8Array): string =>
  toHex(CourseEval.pureCircuits.studentCommitment(secretKey));

export const instructorKeyOf = (secretKey: Uint8Array): string => toHex(CourseEval.pureCircuits.instructorKey(secretKey));

const phaseName = (phase: CourseEval.Phase): Phase =>
  phase === CourseEval.Phase.ENROLLMENT ? 'enrollment' : phase === CourseEval.Phase.OPEN ? 'open' : 'closed';

export const deriveState = (state: CourseEval.Ledger): CourseState => {
  const responses = Number(state.responses);
  return {
    courseCode: decodeCourseCode(state.courseCode),
    phase: phaseName(state.phase),
    enrolled: Number(state.enrolled),
    responses,
    average: responses === 0 ? null : Number(state.ratingTotal) / responses,
    distribution: [
      Number(state.oneStar),
      Number(state.twoStar),
      Number(state.threeStar),
      Number(state.fourStar),
      Number(state.fiveStar),
    ],
    instructorKey: toHex(state.instructor),
  };
};

export class CourseEvalAPI {
  readonly contractAddress: ContractAddress;
  readonly state$: Observable<CourseState>;

  private constructor(
    private readonly deployed: any,
    providers: CourseEvalProviders,
  ) {
    this.contractAddress = deployed.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.contractAddress);
    this.state$ = providers.publicDataProvider
      .contractStateObservable(this.contractAddress, { type: 'latest' })
      .pipe(map((contractState) => deriveState(CourseEval.ledger(contractState.data))));
  }

  async enroll(commitmentHex: string): Promise<string> {
    const tx = await this.deployed.callTx.enroll(fromHex(commitmentHex));
    return tx.public.txId;
  }

  async openEvaluation(): Promise<string> {
    const tx = await this.deployed.callTx.openEvaluation();
    return tx.public.txId;
  }

  async closeEvaluation(): Promise<string> {
    const tx = await this.deployed.callTx.closeEvaluation();
    return tx.public.txId;
  }

  async submitRating(rating: number): Promise<string> {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Rating must be 1 to 5');
    const tx = await this.deployed.callTx.submitRating(BigInt(rating));
    return tx.public.txId;
  }

  static async deploy(providers: CourseEvalProviders, secretKey: Uint8Array, courseCode: string): Promise<CourseEvalAPI> {
    const deployed = await deployContract(providers as any, {
      compiledContract: CompiledCourseEvalContract,
      privateStateId: privateStateKey,
      initialPrivateState: createCourseEvalPrivateState(secretKey),
      args: [encodeCourseCode(courseCode)],
    } as any);
    return new CourseEvalAPI(deployed, providers);
  }

  static async join(
    providers: CourseEvalProviders,
    contractAddress: ContractAddress,
    secretKey: Uint8Array,
  ): Promise<CourseEvalAPI> {
    const deployed = await findDeployedContract(providers as any, {
      contractAddress,
      compiledContract: CompiledCourseEvalContract,
      privateStateId: privateStateKey,
      initialPrivateState: createCourseEvalPrivateState(secretKey),
    } as any);
    return new CourseEvalAPI(deployed, providers);
  }
}
