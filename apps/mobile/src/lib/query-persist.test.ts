import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  createAsyncStoragePersister,
  shouldDehydrateMutation,
  shouldRetryQuery,
} from './query-persist';

/**
 * `@react-native-async-storage/async-storage` is globally mocked in
 * `jest-setup.ts` (see that file) with the package's own official jest mock
 * (an in-memory `Map` standing in for the native layer) — no per-file mock
 * needed here, matching how `expo-secure-store`'s equivalent is handled in
 * `token-store.test.ts` (there it's per-file because that's the only
 * consumer; here it's global because both this module AND `../i18n/index.ts`
 * — imported globally for every test file — depend on it).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('createAsyncStoragePersister', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips a persisted client through AsyncStorage', async () => {
    const persister = createAsyncStoragePersister();
    const client = {
      timestamp: 123,
      buster: 'v1',
      clientState: { queries: [{ queryKey: ['a'], queryHash: 'a', state: {} }], mutations: [] },
    };

    await persister.persistClient(client as never);
    const restored = await persister.restoreClient();

    expect(restored).toEqual(client);
  });

  it('restoreClient resolves undefined when nothing has been persisted yet', async () => {
    const persister = createAsyncStoragePersister();
    await expect(persister.restoreClient()).resolves.toBeUndefined();
  });

  it('removeClient clears the persisted entry', async () => {
    const persister = createAsyncStoragePersister();
    await persister.persistClient({
      timestamp: 1,
      buster: '',
      clientState: { queries: [], mutations: [] },
    } as never);

    await persister.removeClient();

    await expect(persister.restoreClient()).resolves.toBeUndefined();
  });
});

describe('shouldDehydrateMutation', () => {
  it('never persists mutations — queries only', () => {
    expect(shouldDehydrateMutation()).toBe(false);
  });
});

describe('shouldRetryQuery', () => {
  it('does not retry a TOO_MANY_REQUESTS tRPC error', () => {
    const error = { data: { code: 'TOO_MANY_REQUESTS' } };
    expect(shouldRetryQuery(0, error)).toBe(false);
    expect(shouldRetryQuery(1, error)).toBe(false);
  });

  it('retries other errors up to a small cap', () => {
    const error = { data: { code: 'INTERNAL_SERVER_ERROR' } };
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(true);
    expect(shouldRetryQuery(2, error)).toBe(false);
  });

  it('retries an error with no data.code (network failure, non-tRPC error)', () => {
    expect(shouldRetryQuery(0, new Error('network down'))).toBe(true);
    expect(shouldRetryQuery(0, undefined)).toBe(true);
  });
});
