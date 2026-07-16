import type { TFunction } from 'i18next';

/**
 * `CaseSubmission.status` (`packages/core/src/submissions/submission.service.ts`'s
 * `SUBMISSION_STATUSES`) is a plain Prisma `String` column, not a Prisma
 * enum — the wire type (`SerializedCaseSubmission.status`, see
 * `../lib/api-types.ts`'s `SerializedSubmission`/`SerializedSubmissionDetail`)
 * is therefore just `string`, not a closed union. This module owns the
 * mobile-side badge colors for the 5 known values (mirrored from
 * `packages/api/src/routers/submissions.ts`'s own local
 * `caseSubmissionStatusSchema` enum, the only place this list is validated
 * at all) and falls back to an unstyled grey for anything else, so an
 * unrecognized status never crashes a render.
 *
 * Labels (SP-4b Task 6) route through i18n's `submissionStatus.*` keys
 * (`../i18n/{ru,kk}.json`) rather than a hardcoded Russian map — callers pass
 * their own `t` (from `useTranslation()`) so this stays a plain function, not
 * a hook, and can be called from anywhere a component already has `t`.
 */
export type KnownSubmissionStatus = 'new' | 'in_review' | 'accepted' | 'rejected' | 'done';

const KNOWN_STATUSES: readonly KnownSubmissionStatus[] = [
  'new',
  'in_review',
  'accepted',
  'rejected',
  'done',
];

export type SubmissionStatusColors = { bg: string; text: string };

const COLORS: Record<KnownSubmissionStatus, SubmissionStatusColors> = {
  new: { bg: '#eef2ff', text: '#2563eb' },
  in_review: { bg: '#fff7e6', text: '#b45309' },
  accepted: { bg: '#ecfdf3', text: '#15803d' },
  rejected: { bg: '#fef2f2', text: '#b91c1c' },
  done: { bg: '#f1f5f9', text: '#334155' },
};

function isKnownStatus(status: string): status is KnownSubmissionStatus {
  return (KNOWN_STATUSES as readonly string[]).includes(status);
}

export function submissionStatusLabel(status: string, t: TFunction): string {
  return isKnownStatus(status) ? t(`submissionStatus.${status}`) : status;
}

export function submissionStatusColors(status: string): SubmissionStatusColors {
  return isKnownStatus(status) ? COLORS[status] : { bg: '#f1f1f1', text: '#555555' };
}
