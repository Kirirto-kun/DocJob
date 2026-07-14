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
// buildCaseEmbeddingText, toVectorLiteral, upsertCaseEmbedding) — reused
// directly as `core.upsertCaseEmbedding(...)`, same convention as
// case.mapper's serializeCase.
export * from './search/embeddings';
// Namespaced: service functions, called as `core.search.searchCases(actor, query)`.
// search.service.ts also re-exports the embedding helpers, so
// `core.search.upsertCaseEmbedding(...)` works equally well.
export * as search from './search/search.service';

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
