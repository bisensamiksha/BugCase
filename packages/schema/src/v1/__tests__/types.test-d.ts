import type { BugReportV1 } from '../report';
import type { BugReportV1Inferred } from '../schemas/report.schema';

type ExactInferred<T> = T extends object
  ? T extends readonly (infer U)[]
    ? ReadonlyArray<ExactInferred<U>>
    : { [K in keyof T]: Exclude<ExactInferred<T[K]>, undefined> }
  : T;

const _check1: BugReportV1 = {} as ExactInferred<BugReportV1Inferred>;
const _check2: BugReportV1Inferred = {} as BugReportV1;
void _check1;
void _check2;
