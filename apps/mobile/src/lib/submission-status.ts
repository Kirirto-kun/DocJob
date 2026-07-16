/**
 * `CaseSubmission.status` (`packages/core/src/submissions/submission.service.ts`'s
 * `SUBMISSION_STATUSES`) is a plain Prisma `String` column, not a Prisma
 * enum — the wire type (`SerializedCaseSubmission.status`, see
 * `../lib/api-types.ts`'s `SerializedSubmission`/`SerializedSubmissionDetail`)
 * is therefore just `string`, not a closed union. This module owns the
 * mobile-side Russian labels + badge colors for the 5 known values
 * (mirrored from `packages/api/src/routers/submissions.ts`'s own local
 * `caseSubmissionStatusSchema` enum, the only place this list is validated
 * at all) and falls back to the raw value for anything else, so an
 * unrecognized status never crashes a render — it just shows unstyled.
 */
export type KnownSubmissionStatus = 'new' | 'in_review' | 'accepted' | 'rejected' | 'done';

const LABELS: Record<KnownSubmissionStatus, string> = {
  new: 'Новое',
  in_review: 'На рассмотрении',
  accepted: 'Принято',
  rejected: 'Отклонено',
  done: 'Завершено',
};

export type SubmissionStatusColors = { bg: string; text: string };

const COLORS: Record<KnownSubmissionStatus, SubmissionStatusColors> = {
  new: { bg: '#eef2ff', text: '#2563eb' },
  in_review: { bg: '#fff7e6', text: '#b45309' },
  accepted: { bg: '#ecfdf3', text: '#15803d' },
  rejected: { bg: '#fef2f2', text: '#b91c1c' },
  done: { bg: '#f1f5f9', text: '#334155' },
};

function isKnownStatus(status: string): status is KnownSubmissionStatus {
  return Object.prototype.hasOwnProperty.call(LABELS, status);
}

export function submissionStatusLabel(status: string): string {
  return isKnownStatus(status) ? LABELS[status] : status;
}

export function submissionStatusColors(status: string): SubmissionStatusColors {
  return isKnownStatus(status) ? COLORS[status] : { bg: '#f1f1f1', text: '#555555' };
}
