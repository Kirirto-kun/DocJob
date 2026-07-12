/**
 * Single source of truth for site-level SEO constants.
 *
 * SITE_URL is read from NEXT_PUBLIC_SITE_URL (set it in prod `.env`). It falls
 * back to the production domain so canonical/sitemap/OG still resolve even if
 * the env var is missing. Always without a trailing slash.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://docjob.kz').replace(
  /\/+$/,
  '',
);

export const SITE_NAME = 'DocJob';

export const SITE_EMAIL = 'docjob@inbox.kz';

/**
 * SEO keyword pool (RU). Google largely ignores the `keywords` meta tag, but
 * Yandex still factors it in, and the list doubles as guidance for on-page copy.
 * Source: docs/SEO_optimization.md.
 */
export const SEO_KEYWORDS = [
  'DocJob',
  'DocJob AI',
  'DocJob ИИ',
  'клинические случаи',
  'клинические кейсы',
  'медицинские кейсы',
  'разбор клинических случаев',
  'база клинических случаев',
  'медицинское образование',
  'непрерывное медицинское образование',
  'обучение врачей',
  'повышение квалификации врачей',
  'медицинская платформа',
  'образовательная платформа для врачей',
  'медицинская библиотека',
  'медицинский справочник',
  'медицинские протоколы',
  'клинические рекомендации',
  'доказательная медицина',
  'ИИ для врачей',
  'искусственный интеллект в медицине',
  'медицинский искусственный интеллект',
  'поиск диагноза по симптомам',
  'поиск похожих клинических случаев',
  'нейросеть для врачей',
  'ситуационные задачи по медицине',
  'подготовка к интернатуре',
  'подготовка к ординатуре',
  'разбор клинических случаев для студентов',
  'медицинские кейсы для студентов',
  'медицинские тесты',
  'сложный клинический случай',
  'редкий клинический случай',
  'врачебная ошибка',
  'анализ врачебных ошибок',
  'консилиум врачей',
] as const;
