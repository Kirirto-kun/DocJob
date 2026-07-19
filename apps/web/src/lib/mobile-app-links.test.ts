import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getMobileAppLinks,
  normalizeAndroidAppRelease,
  normalizePublicAppUrl,
  type AndroidAppReleaseInput,
} from './mobile-app-links';

const validAndroidRelease: AndroidAppReleaseInput = {
  url: 'https://docjob.kz/downloads/android/docjob-android-1.0.0-1.apk',
  version: '1.0.0',
  versionCode: '1',
  sha256: 'A'.repeat(64),
  sizeBytes: '73400320',
};

const invalidAndroidReleaseFields = [
  ['url', undefined],
  ['version', undefined],
  ['versionCode', undefined],
  ['sha256', undefined],
  ['sizeBytes', undefined],
  ['url', 'https://docjob.kz/downloads/android/release.html'],
  ['version', 'latest'],
  ['versionCode', '0'],
  ['versionCode', '1.5'],
  ['versionCode', '2100000001'],
  ['sha256', 'abc123'],
  ['sizeBytes', '-1'],
] satisfies Array<[keyof AndroidAppReleaseInput, string | undefined]>;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('normalizePublicAppUrl', () => {
  it('normalizes a valid HTTPS store link', () => {
    expect(normalizePublicAppUrl('  https://play.google.com/store/apps/details?id=kz.docjob  ')).toBe(
      'https://play.google.com/store/apps/details?id=kz.docjob',
    );
  });

  it.each([
    undefined,
    '',
    'not-a-url',
    'http://play.google.com/store/apps/details?id=kz.docjob',
    'javascript:alert(1)',
    'https://user:password@example.com/download',
  ])('rejects an unavailable or unsafe value: %s', (value) => {
    expect(normalizePublicAppUrl(value)).toBeNull();
  });
});

describe('normalizeAndroidAppRelease', () => {
  it('returns a verified release and normalizes its checksum', () => {
    expect(normalizeAndroidAppRelease(validAndroidRelease)).toEqual({
      url: validAndroidRelease.url,
      version: '1.0.0',
      versionCode: 1,
      sha256: 'a'.repeat(64),
      sizeBytes: 73_400_320,
    });
  });

  it.each(invalidAndroidReleaseFields)(
    'rejects incomplete or invalid %s metadata',
    (field, value) => {
      expect(normalizeAndroidAppRelease({ ...validAndroidRelease, [field]: value })).toBeNull();
    },
  );
});

describe('getMobileAppLinks', () => {
  it('keeps Android unavailable until every release variable is valid', () => {
    vi.stubEnv('NEXT_PUBLIC_ANDROID_APP_URL', validAndroidRelease.url!);
    vi.stubEnv('ANDROID_APP_VERSION', validAndroidRelease.version!);
    vi.stubEnv('ANDROID_APP_VERSION_CODE', validAndroidRelease.versionCode!);
    vi.stubEnv('ANDROID_APP_SHA256', validAndroidRelease.sha256!);
    vi.stubEnv('ANDROID_APP_SIZE_BYTES', '');

    expect(getMobileAppLinks().android).toBeNull();

    vi.stubEnv('ANDROID_APP_SIZE_BYTES', validAndroidRelease.sizeBytes!);
    expect(getMobileAppLinks().android?.versionCode).toBe(1);
  });
});
