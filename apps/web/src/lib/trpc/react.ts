import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@docjob/api';

/**
 * The `AppRouter`-typed React-Query bindings (SP-1d's `@docjob/api` tRPC
 * router). This is the classic `createTRPCReact` integration (`@trpc/react-
 * query`), not the newer `@trpc/tanstack-react-query` proxy — SP-2 Task 1
 * deliberately picked the well-supported v11 integration.
 *
 * `trpc.Provider` + the query hooks (`trpc.cases.list.useQuery()`, ...) are
 * consumed from here throughout `apps/web`'s client components once each
 * domain migrates off Server Actions (SP-2 tasks 3-5). This file only builds
 * the typed hook factory — the actual `trpc.createClient(...)` instance
 * (with its link/fetch config) lives in `provider.tsx`.
 */
export const trpc = createTRPCReact<AppRouter>();
