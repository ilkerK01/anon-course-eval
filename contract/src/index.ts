import { CompiledContract } from '@midnight-ntwrk/compact-js';
import * as CourseEvalContract from '../managed/course-eval/contract/index.js';
import { witnesses } from './witnesses.js';

export * as CourseEval from '../managed/course-eval/contract/index.js';
export { witnesses, createCourseEvalPrivateState } from './witnesses.js';
export type { CourseEvalPrivateState } from './witnesses.js';

export const CompiledCourseEvalContract = CompiledContract.make('course-eval', CourseEvalContract.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets('./managed/course-eval'),
);
