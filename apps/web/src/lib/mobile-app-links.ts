const ANDROID_VERSION_CODE_MAX = 2_100_000_000;
const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[0-9a-fA-F]{64}$/;

export type AndroidAppRelease = {
  url: string;
  version: string;
  versionCode: number;
  sha256: string;
  sizeBytes: number;
};

export type AndroidAppReleaseInput = {
  url: string | undefined;
  version: string | undefined;
  versionCode: string | undefined;
  sha256: string | undefined;
  sizeBytes: string | undefined;
};

export type MobileAppLinks = {
  android: AndroidAppRelease | null;
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

function parsePositiveInteger(value: string | undefined, max = Number.MAX_SAFE_INTEGER) {
  const candidate = value?.trim();
  if (!candidate || !/^[1-9]\d*$/.test(candidate)) return null;

  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed <= max ? parsed : null;
}

/**
 * A direct APK release is intentionally all-or-nothing. The public button is
 * enabled only after the artifact URL and every verification field have been
 * configured, so an incomplete upload can never be advertised as available.
 */
export function normalizeAndroidAppRelease(
  input: AndroidAppReleaseInput,
): AndroidAppRelease | null {
  const url = normalizePublicAppUrl(input.url);
  const version = input.version?.trim();
  const versionCode = parsePositiveInteger(input.versionCode, ANDROID_VERSION_CODE_MAX);
  const sha256 = input.sha256?.trim();
  const sizeBytes = parsePositiveInteger(input.sizeBytes);

  if (
    !url ||
    new URL(url).pathname.toLowerCase().endsWith('.apk') === false ||
    !version ||
    version.length > 64 ||
    !SEMANTIC_VERSION_PATTERN.test(version) ||
    versionCode === null ||
    !sha256 ||
    !SHA256_PATTERN.test(sha256) ||
    sizeBytes === null
  ) {
    return null;
  }

  return {
    url,
    version,
    versionCode,
    sha256: sha256.toLowerCase(),
    sizeBytes,
  };
}

export function getMobileAppLinks(): MobileAppLinks {
  return {
    android: normalizeAndroidAppRelease({
      url: process.env.NEXT_PUBLIC_ANDROID_APP_URL,
      version: process.env.ANDROID_APP_VERSION,
      versionCode: process.env.ANDROID_APP_VERSION_CODE,
      sha256: process.env.ANDROID_APP_SHA256,
      sizeBytes: process.env.ANDROID_APP_SIZE_BYTES,
    }),
    ios: normalizePublicAppUrl(process.env.NEXT_PUBLIC_IOS_APP_URL),
  };
}
