// Moved to @docjob/types (SP-1b Task 2) so @docjob/core can validate case
// input without depending on apps/web. Re-exported here so every existing
// `@/lib/case-schema` import in the web app keeps working unchanged.
export * from '@docjob/types';
