import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum Phase { ENROLLMENT = 0, OPEN = 1, CLOSED = 2 }

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  findRosterPath(context: __compactRuntime.WitnessContext<Ledger, PS>,
                 leaf_0: Uint8Array): [PS, { leaf: Uint8Array,
                                             path: { sibling: { field: bigint },
                                                     goes_left: boolean
                                                   }[]
                                           }];
}

export type ImpureCircuits<PS> = {
  enroll(context: __compactRuntime.CircuitContext<PS>, commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  openEvaluation(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  closeEvaluation(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  submitRating(context: __compactRuntime.CircuitContext<PS>, rating_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  enroll(context: __compactRuntime.CircuitContext<PS>, commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  openEvaluation(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  closeEvaluation(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  submitRating(context: __compactRuntime.CircuitContext<PS>, rating_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  instructorKey(sk_0: Uint8Array): Uint8Array;
  studentCommitment(sk_0: Uint8Array): Uint8Array;
  nullifierFor(sk_0: Uint8Array, code_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  instructorKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  studentCommitment(context: __compactRuntime.CircuitContext<PS>,
                    sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  nullifierFor(context: __compactRuntime.CircuitContext<PS>,
               sk_0: Uint8Array,
               code_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  enroll(context: __compactRuntime.CircuitContext<PS>, commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  openEvaluation(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  closeEvaluation(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  submitRating(context: __compactRuntime.CircuitContext<PS>, rating_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly courseCode: Uint8Array;
  readonly instructor: Uint8Array;
  readonly phase: Phase;
  roster: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  readonly enrolled: bigint;
  nullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly responses: bigint;
  readonly ratingTotal: bigint;
  readonly oneStar: bigint;
  readonly twoStar: bigint;
  readonly threeStar: bigint;
  readonly fourStar: bigint;
  readonly fiveStar: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               code_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
