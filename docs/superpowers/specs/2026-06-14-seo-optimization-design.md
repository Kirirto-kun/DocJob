# SEO-оптимизация DocJob — дизайн

Дата: 2026-06-14
Статус: согласовано (вариант B)

## Контекст

DocJob — чат-симулятор клинических кейсов на Next.js (App Router) + Postgres,
self-hosted в Docker на VPS. Публичны только `/landing`, `/login`, `/register`,
`/legal/*`; остальное за авторизацией (middleware). Кейсы содержат скрытый
`solution`, поэтому индексировать их нельзя.

Текущее состояние SEO почти нулевое: корневой layout отдаёт только `title` +
`description`; нет `metadataBase`, `robots.txt`, `sitemap.xml`, Open Graph,
Twitter-карточек, JSON-LD, верификации поисковиков.

## Решения (из брейншторма)

- Домен: **docjob.kz**.
- Поисковики: **Google + Яндекс** (KZ/RU аудитория).
- Индексируем: **только лендинг и публичные страницы**. Кейсы остаются закрытыми.

## Объём (вариант B)

1. **`src/lib/site.ts`** — единый источник `SITE_URL`, `SITE_NAME`, список
   SEO-ключей. `SITE_URL` берётся из `NEXT_PUBLIC_SITE_URL`, дефолт
   `https://docjob.kz`, без хвостового слэша.
2. **`src/app/layout.tsx`** — расширенные метаданные: `metadataBase`,
   `keywords`, `openGraph`, `twitter`, `robots`-дефолты, `verification`
   (Google + Яндекс через env), иконки. OG-картинка — существующий
   `/logo_dj.jpg` (без выдуманных размеров).
3. **`src/app/robots.ts`** — `MetadataRoute.Robots`: allow `/`, disallow
   приватных разделов (`/api/`, `/admin/`, кабинет, `/cases/`, `/ai-search`
   и т.д.), ссылка на sitemap, `host`. Логин/регистрация НЕ в disallow —
   закрываются через `noindex` (чтобы поисковик увидел мета-тег).
4. **`src/app/sitemap.ts`** — статические публичные URL (`/landing`, `/news`,
   `/legal/privacy`, `/legal/terms`) + `lastModified` для `/news` по дате
   свежей новости. Деградирует безопасно при ошибке БД.
5. **`src/app/landing/page.tsx`** — JSON-LD (`EducationalOrganization` +
   `WebSite`) и `alternates.canonical`.
6. **`/news` публичной**: добавить в `PUBLIC_PATHS` middleware; переписать
   `src/app/news/page.tsx` как серверный компонент на публичной оболочке
   `LegalPageShell` (рендер на сервере → индексируется). Логин-гейт убирается.
7. **`src/app/login/layout.tsx`, `src/app/register/layout.tsx`** — серверные
   layout'ы с `robots: { index: false, follow: true }` (страницы клиентские,
   сами метадату экспортировать не могут).
8. **`.env.example`** — `NEXT_PUBLIC_SITE_URL`, `GOOGLE_SITE_VERIFICATION`,
   `YANDEX_VERIFICATION`.
9. **`docs/SEO_optimization.md`** — переписать в пошаговую инструкцию (домен,
   env, деплой, Google Search Console, Яндекс.Вебмастер, sitemap) + сохранить
   список ключей.

## Сознательно НЕ делаем

- **Миграция шрифтов на `next/font`** — тянет загрузку шрифтов в build-time;
  риск сломать Docker-сборку на VPS с ограниченным egress. Оставляем `<link>`.
  Задокументировано как опциональный шаг на будущее.
- **Публичный каталог кейсов** — отклонён (риск утечки `solution`).
- **hreflang ru/kk** — локаль определяется cookie, а не URL-префиксом; без
  locale-routing корректный hreflang невозможен. На будущее.

## Ручные шаги пользователя (код не закроет)

DNS docjob.kz → VPS + HTTPS; prod `.env` (`NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`);
регистрация и верификация в Google Search Console и Яндекс.Вебмастере; submit
sitemap. Подробно — в `docs/SEO_optimization.md`.
