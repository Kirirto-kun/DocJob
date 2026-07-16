// Type-only surface onto the tRPC AppRouter. This file (and every file that
// imports from it) must only ever use a type-only import of the @docjob/api
// package — a value import would drag @docjob/core (and transitively
// prisma/argon2/openai) into the React Native bundle. See
// src/__tests__/boundary.test.ts for the mechanical guard, and the ESLint
// `no-restricted-imports` rule in eslint.config.js for the direct-import
// guard on @docjob/core|db|auth.
import type { AppRouter } from '@docjob/api';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

export type { AppRouter };

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

// Convenience aliases (derived from the wire shape via inferRouterOutputs,
// NOT imported from @docjob/core's mapper types):
export type SerializedCase = RouterOutputs['cases']['byId'];
export type CaseListItem = RouterOutputs['cases']['listPaged']['items'][number];
export type SearchHit = RouterOutputs['search']['search'][number];
export type SerializedReview = RouterOutputs['reviews']['forCase'][number];
export type SerializedSubmission = RouterOutputs['submissions']['mine'][number];
export type SerializedUser = NonNullable<RouterOutputs['users']['me']>;
export type SerializedNewsItem = RouterOutputs['news']['list'][number];
export type SerializedAnnouncement = RouterOutputs['announcements']['active'][number];

// SP-4b Task 5 additions (Saved / Submissions / Profile / News / Announcements
// / Banners) — same derivation discipline as above: every alias comes from
// `inferRouterOutputs<AppRouter>`, never from `@docjob/core`'s mapper types.
export type SavedCaseItem = RouterOutputs['saved']['list'][number];
export type SerializedSubmissionDetail = RouterOutputs['submissions']['byId'];
export type SerializedSubmissionMessage = SerializedSubmissionDetail['messages'][number];
export type SerializedReviewWithCase = RouterOutputs['reviews']['mine'][number];
export type BannerManifest = RouterOutputs['banners']['get'];
export type BannerInfo = NonNullable<BannerManifest[keyof BannerManifest]>;
