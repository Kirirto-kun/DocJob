/**
 * The password-reset token helpers moved into @docjob/core (SP-1b Task 3,
 * packages/core/src/users/password-reset-tokens.ts) since they're pure and
 * shared with the core users service. Re-exported here so existing web
 * imports (and this module's own test) keep working unchanged.
 */
export {
  RESET_TOKEN_TTL_MS,
  RESET_TOKEN_RESEND_COOLDOWN_MS,
  generateResetToken,
  hashResetToken,
  resetTokenExpiry,
  isResetTokenExpired,
  isResetTokenUsable,
  isWithinResendCooldown,
} from '@docjob/core';
