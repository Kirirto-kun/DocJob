/* eslint-disable import/no-named-as-default-member -- `i18next`'s default
   export IS the singleton instance; calling `.use()`/`.changeLanguage()` on
   it (rather than importing those as named exports, which would fight the
   `import i18next from 'i18next'` default import used throughout this file
   for `i18next.language`/`i18next.t` etc.) is the standard i18next usage
   pattern, not an accidental default/named mismatch. */
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ru from './ru.json';
import kk from './kk.json';

/**
 * RU (default) + KK catalogs (SP-4b Task 6). Copied by hand from the
 * overlapping surface of `apps/web/src/i18n/messages/{ru,kk}.json` — NOT
 * imported (that file lives under `apps/web`, outside this workspace
 * package's build graph, same "duplicate, don't cross-import" rule
 * `src/lib/taxonomy.ts` already follows for the case taxonomy). Key set is
 * asserted identical between the two catalogs by
 * `src/i18n/key-coverage.test.ts`.
 */
export const SUPPORTED_LANGUAGES = ['ru', 'kk'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const DEFAULT_LANGUAGE: SupportedLanguage = 'ru';
const LANGUAGE_STORAGE_KEY = 'docjob.language';

function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return value === 'ru' || value === 'kk';
}

/**
 * `expo-localization`'s `getLocales()` reflects the device's OS language
 * setting. Only `ru`/`kk` are catalogued — anything else (the device's
 * actual default in most dev/CI environments, e.g. `en`) falls back to `ru`,
 * matching the brief's "ru is the default" requirement. Wrapped in try/catch
 * because native locale resolution can throw in odd host environments (and
 * definitely shouldn't ever crash app boot).
 */
function resolveDeviceLanguage(): SupportedLanguage {
  try {
    const code = Localization.getLocales()[0]?.languageCode;
    return isSupportedLanguage(code) ? code : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

let initialized = false;

/**
 * Synchronous init (`initAsync: false`): the RU/KK catalogs are bundled
 * directly (no backend/HTTP fetch), so there is no reason to defer resource
 * loading into a `setTimeout` (i18next's default — see `initAsync`'s doc
 * comment in `i18next`'s own types). Synchronous init means the very first
 * render already has translations (no flash of raw keys, no need to gate the
 * tree on a "ready" promise). `react.useSuspense: false` for the same
 * reason: nothing here is ever actually loading.
 *
 * Idempotent — safe to import this module's side effect from multiple entry
 * points (`app-providers.tsx` for the real app, `jest-setup.ts` for tests)
 * without double-initializing.
 */
function initI18n(): typeof i18next {
  if (!initialized) {
    initialized = true;
    void i18next.use(initReactI18next).init({
      resources: {
        ru: { translation: ru },
        kk: { translation: kk },
      },
      lng: resolveDeviceLanguage(),
      fallbackLng: DEFAULT_LANGUAGE,
      interpolation: { escapeValue: false },
      initAsync: false,
      react: { useSuspense: false },
    });

    // Fire-and-forget: if the user previously picked a language (Profile's
    // toggle, `setLanguage` below), honour it once AsyncStorage resolves —
    // this runs after the synchronous init above, so the first frame still
    // renders in the device-inferred language and then (usually
    // imperceptibly) switches if a persisted choice disagrees.
    void restorePersistedLanguage();
  }
  return i18next;
}

async function restorePersistedLanguage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored) && stored !== i18next.language) {
      await i18next.changeLanguage(stored);
    }
  } catch {
    // Best-effort — keep whatever `resolveDeviceLanguage()` picked.
  }
}

/** Profile screen's language toggle (SP-4b Task 6). Persists the choice so it survives app restarts. */
export async function setLanguage(language: SupportedLanguage): Promise<void> {
  await i18next.changeLanguage(language);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Best-effort persistence — the language is still applied in-memory for
    // this session even if AsyncStorage write fails.
  }
}

export function getLanguage(): SupportedLanguage {
  return isSupportedLanguage(i18next.language) ? i18next.language : DEFAULT_LANGUAGE;
}

initI18n();

export default i18next;
