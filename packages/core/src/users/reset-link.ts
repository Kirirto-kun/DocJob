/**
 * Builds the client-facing password-reset URL from a configured base +
 * raw reset token. Pure/transport-agnostic (no env reads here — the base is
 * handed in by the caller, which resolves it from `PASSWORD_RESET_URL_BASE`
 * / `AUTH_URL` — see `packages/api/src/context.ts`'s `passwordResetBase`).
 *
 * Decoupled from `AUTH_URL` (which doubles as the CSRF key) on purpose: SP-4a
 * lands this now so a mobile client can start a reset over tRPC even though,
 * per the SP-4 decision, the link itself still points at the web
 * `/reset-password` page for v1 (universal/app-links are a later pass).
 */
export function buildResetLink(base: string, token: string): string {
  return `${base.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
}
