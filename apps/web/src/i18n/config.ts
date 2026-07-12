export const LOCALES = ['ru', 'kk'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ru';

export const LOCALE_COOKIE = 'docjob-locale';

export const LOCALE_LABELS: Record<Locale, { native: string; short: string }> = {
  ru: { native: 'Русский', short: 'RU' },
  kk: { native: 'Қазақша', short: 'KK' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
