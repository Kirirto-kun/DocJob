export type MobileAppLinks = {
  android: string | null;
  ios: string | null;
};

/**
 * Only render store/testing links that are valid HTTPS URLs. Environment
 * values are deployment configuration, but treating malformed values as
 * unavailable prevents accidental javascript:, credential-bearing, or
 * otherwise unsafe links from reaching the public download page.
 */
export function normalizePublicAppUrl(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function getMobileAppLinks(): MobileAppLinks {
  return {
    android: normalizePublicAppUrl(process.env.NEXT_PUBLIC_ANDROID_APP_URL),
    ios: normalizePublicAppUrl(process.env.NEXT_PUBLIC_IOS_APP_URL),
  };
}
