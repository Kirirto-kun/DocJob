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
