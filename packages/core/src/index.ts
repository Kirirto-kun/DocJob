export * from './shared/errors';
export * from './shared/actor';
export * from './shared/pagination';

// Flat: mapper types + serializeCase (other domains, e.g. the search flow
// still living in apps/web/src/app/actions.ts, reuse serializeCase directly).
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
