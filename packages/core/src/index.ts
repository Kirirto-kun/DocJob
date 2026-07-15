export * from './shared/errors';
export * from './shared/actor';
export * from './shared/pagination';

// Flat: mapper types + serializeCase (other domains, e.g. search.service,
// reuse serializeCase directly).
export * from './cases/case.mapper';
// Namespaced: service functions, called as `core.cases.createCase(actor, input)`
// from the web wrapper. Every later domain (users, search, reviews, ...)
// follows this same `export * as <domain> from './<domain>/<domain>.service'`
// pattern.
export * as cases from './cases/case.service';

// Flat: mapper types + serializeUser, plus the pure password-reset-token
// helpers (re-exported here so apps/web/src/lib/password-reset-tokens.ts can
// re-point its import at @docjob/core instead of duplicating the logic).
export * from './users/user.mapper';
export * from './users/password-reset-tokens';
// Namespaced: service functions, called as `core.users.registerUser(input)`.
export * as users from './users/user.service';

// Flat: pure embedding helpers (EMBEDDING_MODEL, EMBEDDING_DIMS, embedText,
// buildCaseEmbeddingText, toVectorLiteral, upsertCaseEmbedding, and — SP-3 T2
// — hashEmbeddingText, reembedCase) — reused directly as
// `core.upsertCaseEmbedding(...)` / `core.reembedCase(...)`, same convention
// as case.mapper's serializeCase.
export * from './search/embeddings';
// Namespaced: service functions, called as `core.search.searchCases(actor, query)`.
// search.service.ts also re-exports the embedding helpers, so
// `core.search.upsertCaseEmbedding(...)` works equally well.
export * as search from './search/search.service';
// Flat: SP-3 T4 hybrid-search result shape (`SearchHit`/`MatchSignal`) — also
// reachable namespaced as `core.search.SearchHit` via the re-export above,
// but exported flat too so `import type { SearchHit } from '@docjob/core'`
// works without going through the `search` namespace.
export type { SearchHit, MatchSignal } from './search/fusion';

// Namespaced: SP-3 T3 dirty-sweep reindex worker, called as
// `core.reindex.reembedDirtyCases(...)`. Built on top of `reembedCase`
// (embeddings.ts) — the durability backstop for embed-on-write.
export * as reindex from './search/reindex.service';

// Flat: mapper types + serializeReview (small domain, but follows the same
// mapper/service split as cases and users for consistency).
export * from './reviews/review.mapper';
// Namespaced: service functions, called as `core.reviews.createReview(actor, input)`.
export * as reviews from './reviews/review.service';

// No dedicated mapper file — `SerializedSavedCase` lives directly in
// saved.service.ts (reuses cases/case.mapper's SerializedCaseListItem for
// its nested case field) and is accessed namespaced as
// `core.saved.SerializedSavedCase`, same convention case.service.ts uses for
// its own input types (e.g. `core.cases.CreateCaseInput`).
export * as saved from './saved/saved.service';

// Tiny CRUD domain, no mapper needed — plain string[] / { label } shapes.
export * as tags from './tags/tag.service';

// Flat: mapper types + serializeSubmission (embeds two user rows — author +
// message sender — via inline `fullName || name` mapping, same convention
// as reviews/review.mapper; no case embed since CaseSubmission has no `caseId`).
export * from './submissions/submission.mapper';
// Namespaced: service functions, called as `core.submissions.createCaseSubmission(actor, input)`.
// Function names intentionally match the web action names 1:1 (same
// convention as reviews/saved) so actions.ts wrappers need no renaming.
export * as submissions from './submissions/submission.service';

// Flat: mapper types + serializeNewsItem. `listPublicNews` (unauthenticated
// read) is reused directly by both the `getNews` web action and
// apps/web/src/lib/news.ts's `getPublicNewsItems`, which the public
// landing/news pages and sitemap import directly (no Server Action).
export * from './news/news.mapper';
// Namespaced: service functions, called as `core.news.createNews(actor, input)`.
export * as news from './news/news.service';

// Flat: mapper types + serializeAnnouncement.
export * from './announcements/announcement.mapper';
// Namespaced: service functions, called as
// `core.announcements.getActiveAnnouncements(actor)`. Note
// `getActiveAnnouncements`/`dismissAnnouncement` deliberately do not use
// `assertApproved` — the original actions gated only on "logged in at all"
// (guest -> `[]`, not an error), preserved verbatim.
export * as announcements from './announcements/announcement.service';

// No mapper — pure validation + honeypot check, no DB, no email transport
// (that stays in the web wrapper, same split as users.requestPasswordReset).
export * as contact from './contact/contact.service';

// Flat + namespaced (same module, same convention as search/embeddings):
// pure banner types/constants plus the filesystem-manifest I/O primitives.
// NOTE: apps/web's banner files (lib/banners.ts, lib/banners-server.ts,
// api/banners/route.ts) are intentionally left untouched/duplicated rather
// than repointed here — those are imported by 'use client' components, and
// this module pulls in Node's `fs`/`path`, which must not leak into a
// client bundle. See task-7-report.md.
export * from './banners/banner.service';
export * as banners from './banners/banner.service';

// Flat: MediaStorage interface + local-disk adapter (SP-1b Task 8 scaffold).
// Not wired into any action yet — apps/web's `/api/attachments/*` and
// `/api/images/*` routes keep calling `@/lib/storage` directly. This is the
// seam future domain services (and an eventual S3 adapter, SP-5) plug into.
export * from './media/storage';
