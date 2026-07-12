# DocJob — Мастер-архитектура: Web + Mobile + Backend

- **Дата:** 2026-07-12
- **Статус:** дизайн согласован; прошёл состязательную проверку (v2); ожидает планов реализации по под-проектам
- **Бренд:** DocJob (user-facing всегда «DocJob», не «MEDIZO»)
- **Тип:** мастер-документ архитектуры (несколько под-проектов; каждый получит собственную спеку → план → реализацию)
- **История:** v1 — первичный дизайн; **v2 — учтены находки состязательной проверки против реального репо** (см. §14)

---

## 1. Контекст и цели

**Что такое DocJob после поворота:** курируемая **библиотека клинических кейсов** с **рецензиями** и **AI-семантическим поиском**. Пользователь читает кейс, читает рецензии, ищет кейсы по смыслу. Роли: `ADMIN`, `DOCTOR`, `REVIEWER`.

**Поворот продукта (отличается от текущего кода):**
- ❌ Убирается **AI-сократический чат** (решение кейса через диалог) — целиком.
- ❌ Убираются `Case.solution` и `Case.taskQuestions` — полностью.
- ❌ Убирается роль `PATIENT` и легаси-поля (`patientIds`, `medicalRecords`, `solvedCaseIds`, `unsolvedCaseIds`, `manage-patients`).
- ✅ **OpenAI остаётся** — для семантического поиска (эмбеддинги) и админ-импорта кейса из markdown.

**Цели:** один продукт — три поверхности (web / mobile RN / backend); «сделать один раз и отлично»: best-practice, рост до **10 000+ без переписывания**; старт на **одном VPS + Docker** (100–1000 юзеров, один регион, доступ по одобрению).

**Не-цели (YAGNI):** никаких MVP-срезов; не делаем язык-агностик/публичный API (клиенты только наши TS → tRPC); мобильный авторинг/админка не нужны.

---

## 2. Ключевые решения

| # | Решение | Обоснование |
|---|---|---|
| Масштаб | 100–1000 старт, future-proof до 10k+ | Масштабируемость архитектурой, не протоколом |
| API-слой | **tRPC-монорепо** | Клиенты только наши TS → сквозная типобезопасность, минимум кода |
| Рефакторинг | **Чистая реструктуризация** в монорепо | web и mobile — клиенты одного ядра |
| Хостинг | **Один VPS + Docker**, спроектирован под рост | Дёшево сейчас; путь 1 VPS → кластер |
| Охват mobile | Паритет **врача + рецензента**, минус чат | Авторинг/админка на web |
| Основной цикл | Читать кейс + рецензии; **AI-поиск = главная фича** | Со слов заказчика |
| solution/taskQuestions | **Удалить полностью** | Чат-механик больше нет |
| PATIENT + легаси | **Удалить** | Чистая модель `ADMIN/DOCTOR/REVIEWER` |
| Auth | Единый **JWT (access+refresh)** вместо cookie-only NextAuth | Работает для web (cookie) и mobile (Bearer) |

---

## 3. Объём продукта

### Пользователь (врач/рецензент) — web и mobile
Вход (логин/регистрация с **согласием** `consentAcceptedAt` + чекбокс terms/privacy / forgot / reset / **экран «ожидает одобрения»**); 🔍 **AI-поиск (главная фича)**; навигация подгруппа → список → **кейс (тело + рецензии)**; рецензент пишет/удаляет рецензию; сохранённые; «предложить кейс» + тред; новости; **объявления-попапы** (с персональным dismissal); **баннеры** (реклама в сайдбаре); профиль (+ фото); **поддержка** (серверная, см. §3.1); контакты.

### Админ — только web
Пользователи + одобрение, добавление врача; авторинг кейсов (BlockNote, **упрощён**: тело + метаданные + вложения); модерация заявок; CMS новостей/объявлений/**баннеров**; AI-импорт из markdown (**упрощён** — тело + метаданные).

### 3.1. Подсистемы, которые надо переделать (не «перенести как есть»)
- **Поддержка:** сейчас клиентский `mailto:` + разовый `/api/support/upload`. `mailto:` не работает в RN → делаем **серверный флоу** (серверное письмо как `sendContactMessage` или тикет-запись) через tRPC, вложения — через media-абстракцию (§5a).
- **Баннеры:** сейчас файловый JSON-манифест (`banners-server.ts` пишет на диск), рендерится в сайдбаре каждой страницы + логина, публичное чтение. Нужен домен `banners` в `core` + tRPC-роутер; решить: файл-манифест vs Prisma-модель; рендер на mobile; публичность чтения под JWT.
- **Медиа:** две модели — `CaseImage` (публичный `/api/images/*`) и `CaseAttachment` (сессионный `/api/attachments/*`) — мапим на `media/storage.ts`; убрать дублирование `avatar` vs `profilePhotoUrl` (оставить одно); дать **не-админский** путь загрузки фото профиля (сейчас профиль грузит в admin-only `/api/images/upload` и ловит 401) — с Bearer для mobile.

### Удаляется
Чат-субсистема целиком; `solution`; `taskQuestions`; роль `PATIENT`; `manage-patients`; легаси-поля пользователя. Полный упорядоченный инвентарь — §13.

---

## 4. Обзор архитектуры

**Turborepo-монорепо (pnpm workspaces).**

```
docjob/
├── apps/  web/ (Next.js 15 — SSR + клиент + админка)   mobile/ (Expo)
└── packages/
    core/  (бизнес-логика по доменам; не знает про Next/tRPC/React)
    db/    (Prisma-схема + миграции + клиент-синглтон)
    auth/  (JWT access+refresh, argon2id, guards, approvedAt-гейт)
    api/   (tRPC-роутеры + context + middleware; импортит core+auth)
    types/ (zod-схемы + общие TS-типы)   config/ (env-валидация zod)
```

**Правило зависимостей:** `db/types/config → core → api`; клиенты (`web`, `mobile`) зависят от `api` (типы) и `types`. `core` не импортит транспорт.

### Разрешение противоречия принципов (из проверки — было два несовместимых обещания)

Фиксируем **один шов**: web SSR вызывает `core` **через тонкий in-process server-side tRPC-caller с зафиксированным интерфейсом**. Тогда:
- Сейчас: web-SSR и API-роутер живут в одном процессе Next → без HTTP-хопа к себе.
- Stage-2 (вынос API в отдельный процесс): **меняется только транспорт caller'а** (in-process → HTTP-link), интерфейс тот же → клиентский код не трогаем.
- **Оговорка честно:** если `core` крутится in-process и в web, и в отдельном API-процессе, это два пула Prisma и два OpenAI-клиента — учитываем при переходе (лимиты соединений, пулер).

mobile всегда ходит по сети (HTTPS + Bearer JWT) через тот же роутер.

---

## 5. Бэкенд

### 5a. `core` — доменные сервисы
Feature-sliced: `cases/ search/ reviews/ submissions/ users/ news/ announcements/ tags/ banners/ support/ media/ shared/`.
**Prisma напрямую** (не вводим слой репозиториев — YAGNI для одной БД). Абстракцию вводим **только для файлов** (`media/storage.ts`: локальный диск → S3/R2). Сервисы транспортно-независимы, покрыты интеграционными тестами против тестового Postgres.

### 5b. `db` — модель данных

**Удаляем:** модель `ChatSession` (+ relation `Case.chatSessions`); поля `User.{solvedCaseIds,unsolvedCaseIds,patientIds,medicalRecords}`; enum-значение `Role.PATIENT`; поля `Case.{solution,taskQuestions}`; **enum `CaseMode` целиком** (см. §12.1 — это не «под вопросом», а явное удаление).

**Оставляем/подтверждаем в модели:** `AnnouncementDismissal` (персональное закрытие попапов — сейчас в §5b мог потеряться), `Review`, `SavedCase`, `CaseSubmission(+Message)`, `NewsItem`, `Announcement`, `Tag`, `PasswordResetToken`, `CaseImage`, `CaseAttachment`.

**Добавляем:**
- `Case.embedding vector(1536)` + **HNSW**-индекс (cosine) — есть; **добавить `embeddingDirty Boolean @default(true)`** (или `embeddingUpdatedAt` / `bodyHash`) — грязный флаг для надёжного embed-on-write (§6).
- Генерируемая колонка `to_tsvector('russian', …)` + **GIN**-индекс и `pg_trgm`-индекс — для лексической части поиска (сейчас их НЕТ, это net-new).
- **`RefreshToken`** — поля (по образцу `PasswordResetToken`): `id, userId, familyId (indexed), tokenHash @unique (хранить ХЕШ, не плейнтекст), expiresAt, rotatedToId?/replacedAt?, revokedAt?/revokeReason?, deviceLabel?, createdAt`. Без `familyId` + линии ротации невозможны семейная отзыв-детекция и «выйти на этом устройстве».

**Миграция enum'ов (важно):** в Postgres нет `ALTER TYPE … DROP VALUE`. Удаление `PATIENT` и всего `CaseMode` = ручная миграция: пред-мигрировать строки с этим значением → снять `DEFAULT` → создать новый enum → `ALTER COLUMN … TYPE` → удалить старый тип. Prisma-diff это не сгенерит и упадёт на единственной оставшейся строке.
**Архив данных:** прошлая миграция `20260607000000` уже обнулила `solution`/`taskQuestions` → архивировать нечего; **реальный контент теряет только drop `ChatSession`** (`messages/finalAnswer/evaluation`) — решить явно, дампим ли перед удалением.

### 5c. `auth` — JWT с ротацией (переработано после проверки)

- **Access-JWT** ~15 мин (`jose`) + **Refresh-token** ~60 дней (таблица `RefreshToken`, хеш at-rest).
- **Пароли argon2id для ВСЕХ путей записи** (register, reset, change — не только login-rehash; сейчас `resetPassword`/`registerUser` пишут bcrypt). Ре-хеш bcrypt→argon2id при первом успешном входе.
- **Точка авторизации/отзыва (заполняет дыру stateless-JWT):** Edge-middleware проверяет **только подпись+срок** JWT (без БД). **Роль + `approvedAt` (+ будущий `disabledAt`) перечитываются из первичной БД в tRPC-мидлваре `protected/reviewer/admin` на каждый запрос** (PK-lookup — сохраняет сегодняшнюю мгновенную отзыв-детекцию; иначе `approvedAt` «декоративен» до 60 дней). Refresh-эндпоинт тоже перечитывает `approvedAt` и **отзывает семью токенов при снятии одобрения**. Добавить админское «revoke all sessions». Stage-2: чтения ротации/отзыва — только к primary, не к реплике.
- **Транспорт silent-refresh для web (был блокер — не был описан):**
  (a) middleware = Edge, только `jose`-verify, без БД;
  (b) **Node-runtime route-handler `/api/auth/refresh`** читает httpOnly refresh-cookie, ротирует в Prisma, `Set-Cookie` обоих токенов;
  (c) **триггер:** клиентский 401-интерсептор (retry после refresh) **и** middleware near-expiry редирект через (b) — потому что 15-мин access-cookie истечёт посреди SSR, а RSC не может `Set-Cookie` во время рендера.
- **Гонка ротации (был high):** клиентский **single-flight мьютекс** refresh (web и mobile — один refresh в полёте, остальные ждут) **+ серверное grace-окно** (принять непосредственный родительский токен один раз в течение N сек после ротации без отзыва семьи). Иначе параллельный refetch React Query → N параллельных refresh → ложная reuse-detection → массовый логаут.
- **CSRF (был блокер — терялся с уходом от NextAuth):** для cookie-пути (web) — строгая проверка **Origin/Referer allowlist в tRPC-контексте на все мутации** (или double-submit token); мутации только POST, состояние-меняющие GET запрещены (tRPC httpBatchLink отдаёт queries по GET); **Bearer/mobile освобождён** (не cookie-driven). `SameSite=Lax` сам по себе недостаточен; CORS управляет чтением ответа, не отправкой cookie.
- **Anti-oracle логина (был high):** `checkLoginIssue` — публичный неаутентифицированный `bcrypt.compare` без rate-limit (юзер-энумерация + password-oracle) → **удалить**; различие «pending vs invalid» вернуть **в вывод login-процедуры только после успешной проверки пароля**; добавить **IP+account rate-limit/lockout** на login и refresh ДО запуска argon2.
- **Ротация `AUTH_SECRET` без глобального логаута:** верификация access-JWT против **набора ключей `kid → {current, previous}`** с окном перекрытия (подписываем current, проверяем оба). Иначе каждая ротация = разлогин всей базы.
- Хранение: web — access+refresh в `httpOnly, Secure, SameSite=Lax` cookie; mobile — `expo-secure-store` + `Authorization: Bearer`.
- **Клиентский слой сессии (был выпущен):** уходит `next-auth/react` (`useSession` держит `isInitialized/currentUser` во всём приложении, `signIn/signOut`). access httpOnly → JS не читает роль → нужен **SSR-hydrated user + эндпоинт `/api/me`** взамен `/api/auth/session`; убрать все `next-auth/react`; сохранить `callbackUrl`-раунд-трип (login + middleware) и контракт `isInitialized`.

### 5d. `api` — tRPC
Роутеры: `auth, cases, search, reviews, saved, submissions, news, announcements, tags, banners, support, users, adminCases`. Контекст резолвит юзера из cookie (web) ИЛИ Bearer (mobile). Процедуры `public/protected/reviewer/admin` (перечитывают роль+approvedAt — см. 5c). Валидация zod из `types`; типизированные ошибки `core`→`TRPCError`; rate-limit на `auth`+`search`; cursor-пагинация; логи `pino`+request-id.

---

## 6. Семантический поиск (главная фича, переработано)

- **Модель:** OpenAI `text-embedding-3-small` (1536). Эмбеддим «поисковый документ» кейса (`name+primaryCondition+specialty+subgroup+tags+плоский текст тела+teaser`), не сырой BlockNote.
- **Embed-on-write с durability (был high — раньше только декларировался):** каждая запись кейса ставит `embeddingDirty=true`; эмбеддинг считается **не fire-and-forget**, а фоновым воркером (**cron-контейнер / pg-boss**), который берёт грязные строки, считает вектор с **guard по version/bodyHash** (не перезаписать более свежую правку) и сбрасывает флаг только при успехе. Текущий `embed:cases` эмбеддит лишь `WHERE embedding IS NULL` → уже-эмбедженный кейс с упавшим ре-эмбедом навсегда с устаревшим вектором — исправляем через флаг.
- **Гибрид (net-new, не «как есть»):** сейчас `searchCases` = один pgvector-KNN + JS-boost; **лексики/RRF нет**. SP-3: выбрать русский FTS-конфиг, добавить генерируемую `to_tsvector('russian')` + GIN и `pg_trgm`, затем **RRF** (vector ⊕ lexical). 
- **Recall-подводный камень HNSW+`WHERE`:** pre-filter по `subgroup/specialty/tags` при ANN может резать recall → over-fetch с k-множителем + пост-фильтр, либо partial-индексы / pgvector iterative-scan.
- **Стоимость:** кэш эмбеддингов запросов (TTL, Postgres/in-memory→Redis); rate-limit; триггер по submit/debounce.
- **«Генерации нет» — сверить:** текущий поиск делает LLM intent-expansion шаг. Либо **убрать** его (зафиксировать recall-tradeoff), либо оставить и **снять claim про «нет галлюцинаций»**. Возвращаемые кейсы — курируемые (не генерятся) в любом случае.
- **UX:** подсветка терминов, «почему нашлось», пустые состояния, лог zero-result запросов.

---

## 7. Web-клиент (`apps/web`)

- Next.js 15 App Router, тот же дизайн (shadcn+Tailwind, тёмная тема), лендинг 3D, next-intl.
- **Server Actions → tRPC (детализировано после проверки):**
  - Решение **remove vs wrapper по каждой из ~60 actions** — таблица `action → router` в спеке SP-2.
  - **RSC cache-coherence:** клиентские React-Query мутации НЕ могут звать `revalidatePath` (server-only). По каждой мутации выбрать: клиентский `router.refresh()`/инвалидация query, ЛИБО тонкий server-action-wrapper, который зовёт caller и потом `revalidatePath/Tag`. **Перечислить все ~19 текущих `revalidatePath`-целей**, чтобы ни одна не потерялась.
- Админка остаётся здесь; авторинг упрощён (без solution/task). Auth — httpOnly cookie + `/api/me` + `isInitialized` (см. 5c). Удаляется чат-UI; сносится легаси (§13).
- **Публичная SEO-поверхность сохраняется в `apps/web`:** динамические `sitemap.ts`, `robots.ts`, JSON-LD лендинга, OG/Twitter-мета, публичные `/news` + `/legal/*`, редирект `/ → /landing` для анонимов. Env: `GOOGLE_SITE_VERIFICATION`, `YANDEX_VERIFICATION`, `SITE_URL` (были пропущены в §13).

---

## 8. Mobile-клиент (`apps/mobile`)

- **Стек:** Expo (managed + dev-client), expo-router, React Query + tRPC-клиент, `expo-secure-store`, single-flight refresh-мьютекс (5c).
- **Экраны:** auth (+ **согласие** consentAcceptedAt, + «ожидает одобрения»); табы 🔍 Поиск · Кейсы · Сохранённые · Мои заявки · Профиль; кейс (тело + рецензии, рецензент пишет рецензию); «предложить кейс» + тред; новости; **объявления-попап с персональным dismissal**; **баннеры**.
- **Рендер тела:** BlockNote-JSON → **HTML на сервере** (`body.html` в API) → `react-native-webview`.
- **Медиа:** картинки — прямой URL; вложения — Bearer-прокси / signed-URL (через media-абстракцию 5a).
- **Reset пароля на mobile:** universal/app-links → экран reset с токеном, ЛИБО reset объявляем web-only с hand-off (решить). Публичный base-URL письма — env `AUTH_URL/APP_URL` (сейчас `resetBaseUrl()` читает `NEXTAUTH_URL`, пропущен в §13 — переименовать, иначе прод-письма ведут на localhost).
- **Оффлайн:** персист React Query. **i18n:** RU-каталоги через i18next (+ решение RU/KK — §12.3).
- **Доставка:** EAS Build + EAS Update. **Дистрибуция:** App Store (Apple Dev $99/год), Google Play ($25) + APK для пилота.

---

## 9. Инфраструктура и масштабирование

**Сейчас (1 VPS):** Nginx+certbot (хост) → `web` (Next.js+tRPC, `127.0.0.1:3000`) → `postgres` (pgvector) [+ опц. `redis`] [+ `worker` для embed-backfill]; media → локальный том.

**Best-practice правки:**
- `output:'standalone'` **с оговоркой:** он ломает in-container `tsx`-скрипты (`db:seed:prod`, `embed:cases:prod` — текущий Dockerfile специально копирует `src/scripts/tsconfig`+node_modules). Решение: **отдельный tooling-образ/стейдж** для maintenance-скриптов, standalone — только для web-runtime; выставить `outputFileTracingRoot` (корень монорепо) и проверить трейс в CI.
- Сборка вне VPS → **GHCR** → `pull` (атомарно, без OOM).
- **CI/CD (GitHub Actions):** push → typecheck+lint+unit+integration → build → push → deploy по SSH. Mobile → EAS.
- **Бэкапы:** ночной `pg_dump` → offsite + том вложений.
- **Мониторинг:** healthcheck + внешний аптайм, **Sentry** (web/mobile/API), логи `pino`.
- **Безопасность:** rate-limit (Nginx+app), security-заголовки, **CORS заперт на web-origin, credentials НИКОГДА cross-origin**; mobile=Bearer (нативный fetch не под CORS — не ослаблять CORS «ради mobile»); fail2ban; ufw; Postgres не наружу; keyed-ротация `AUTH_SECRET` (5c).
- **Миграции:** при >1 реплики — отдельный one-shot job.

**Путь «1 VPS → кластер» — с честными предпосылками (было переоценено «тот же код»):**

| Стадия | Нагрузка | Инфра | Код/предпосылки |
|---|---|---|---|
| 0 (сейчас) | 100–1000 | 1 VPS, все контейнеры, локальный диск | — |
| 1 (рост) | тысячи | Redis (кэш+**shared Next cacheHandler**), S3/R2 (media, signed-URL), PgBouncer | **до >1 реплики web ОБЯЗАТЕЛЬНЫ**: shared cacheHandler (иначе `revalidatePath` пишет локальный `.next/cache` каждой реплики) и S3 (media пишется/стримится из локального `UPLOAD_DIR`). Это не «тот же код» — это предпосылки. |
| 2 (10k+) | 10k+ | Managed Postgres + реплики, N контейнеров за LB, CDN, вынос API-процесса (§4) | `core`/auth/логика без изменений; транспорт caller'а web SSR: in-process→HTTP |

Zero-downtime деплой с перекрытием контейнеров до Stage-1: держать **1 реплику web** или общий том uploads + решённый RSC-кэш.

---

## 10. Тестирование и качество

Unit (vitest) — сервисы `core`; Integration — `core`+tRPC против **тестового Postgres** (Testcontainers, pgvector); контракт API (zod, гварды, ошибки); E2E web (Playwright); E2E mobile (Maestro); **auth-безопасность** (ротация refresh + reuse-detection + single-flight гонка + oracle-lockout). ⚠️ **выключить `typescript.ignoreBuildErrors` и `eslint.ignoreDuringBuilds`**; CI-гейты обязательны на каждый PR. Заметка: CI не ловит orphan i18n-ключи (§12.3) — отдельная задача.

---

## 11. Разбивка на под-проекты

| SP | Что | Зависит |
|---|---|---|
| **SP-0** | Монорепо-фундамент: Turborepo+pnpm; **сначала `packages/db`(prisma+синглтон)+`config`, кодмод импортов `@/*` (единый алиас `@/*→./src/*` в ~43 файлах не пересекает пакеты), per-package `prisma generate` в Turbo-пайплайн, compat-barrel, verify build**, ПОТОМ peel core/auth/api. Учесть взаимодействие со standalone-трейсингом | — |
| **SP-1** ★ | Бэкенд-ядро: `core` из actions, `api` (tRPC), `auth` (JWT+refresh+CSRF+refresh-транспорт+oracle-fix — §5c целиком), миграция модели (§5b, вкл. enum-рецепт), удаление CaseMode | SP-0 |
| **SP-2** | Web на tRPC: action→router-таблица + RSC-cache-plan (~19 revalidatePath), убрать чат-UI, `/api/me`+isInitialized взамен NextAuth, упростить авторинг, снести легаси (§13), i18n-cleanup | SP-1 |
| **SP-3** | Поиск: `embeddingDirty`+воркер, русский FTS+GIN+pg_trgm, RRF, HNSW-recall-fix, кэш, rate-limit, решение про intent-expansion | SP-1 |
| **SP-4** | Mobile (Expo): auth+secure-store+single-flight, экраны, WebView-рендер, баннеры/объявления, reset-deep-link, i18n, оффлайн, EAS | SP-1 |
| **SP-5** | Инфра: standalone+tooling-образ, CI/CD+GHCR, бэкапы, мониторинг, S3-абстракция, shared cacheHandler-готовность, хардненинг | параллельно |

**Критический путь:** SP-0 → SP-1 → SP-2/SP-3/SP-4 частично параллельно. **Первым детализируем SP-0 + SP-1** (auth-блокеры — внутри спеки SP-1).

---

## 12. Открытые вопросы (нужно решение заказчика)

1. **`CaseMode`** — удаляем (§5b). Решить: нужен ли в админ-каталоге фильтр «тип» после того, как `subgroup` возьмёт роль (сейчас mode — enum+NOT-NULL default+индекс, в сериализаторах, `getCasesPaginated` WHERE, admin-фильтрах, авторинге new-case, обязательном параметре импорта, seed/import).
2. **Дамп `ChatSession`** перед удалением — да/нет (единственные реальные пользовательские данные среди удаляемого).
3. **RU vs RU/KK** — каталоги `kk.json` есть; память говорит «RU primary». Решить до i18n-cleanup, чтобы прогнать один раз.
4. **Баннеры** — оставляем рекламные баннеры в новой архитектуре (файл-манифест → или DB-модель) или выпиливаем?
5. **Поддержка** — серверное письмо или тикет-запись (§3.1).
6. **Reset на mobile** — deep-link в приложение или web-only hand-off (§8).
7. **`avatar` vs `profilePhotoUrl`** — оставить одно поле (какое).

## 12a. Технические риски (учтены в дизайне)
- Cutover auth (NextAuth→JWT) инвалидирует активные сессии — форс-релогин, коммуникация.
- BlockNote→HTML: проверить точность (таблицы/callout/изображения) на реальных кейсах.
- `React 18.3` vs vendored React 19 (Next 15) — зафиксировать при апгрейдах.
- Дублирование Prisma-пула/OpenAI-клиента при вынесенном API-процессе (§4) — учесть на Stage-2.

---

## 13. Приложение А: инвентарь изменений (переупорядочен)

### Удалить свободно (уже осиротевшее)
`case-chat-view`, `solution-panel`, `diagnosis-submit-dialog`, `use-case-chat`, `getCaseSolution`; мёртвый `updateUserStatistics` (ноль вызовов).

### Вырезать в порядке зависимостей ДО/ВМЕСТЕ с drop `ChatSession` (иначе билд падает)
Экспортируемые чат-actions (`handleCaseChat/startCaseChat/getChatSession/resetChatSession` держат `prisma.chatSession` живым); relation `Case.chatSessions`; `prisma/seed.ts` (импортит `CaseMode`, строит кейсы с `mode/taskQuestions/solution` — ломает `db:seed`); `scripts/e2e-smoke.ts`, `scripts/e2e-create-case.ts`; `src/ai/flows/case-chat-flow.ts`.

### PATIENT + легаси — все живые точки (каждая = компайл/рантайм-брейк)
Root-дашборд ветка `role==='patient'` + счётчики пациентов; `use-user-store` `UserRole 'patient'` + каст в `'PATIENT'`; `createUser/updateUser` zod (принимает `PATIENT`+`medicalRecords/patientIds`); `SerializedUser/getUsers` поля; `add-doctor` payload `patientIds`; карточка «Статистика» профиля (`solvedCount/unsolvedCount` — удалить/переосмыслить); `ScenarioControls` `handleFileUpload`+ветка пациента (пишет `medicalRecords`); легаси Genkit-флоу + `src/ai/genkit.ts`/`dev.ts` + `GOOGLE_API_KEY`; устаревшая ссылка `/add-patient` в `robots.ts`.

### AI-импорт — явные правки (не «reuse simplified»)
`structuredCaseDraftSchema` (убрать обязательные `solution/taskQuestions`); системный промпт импорта (переписать — он построен вокруг извлечения скрытого solution+задач); `scripts/import-cases.ts` (кормит `draft.taskQuestions/solution` в `createCase`); решить, игнорирует ли новый промпт секции `ОТВЕТ/ЗАДАНИЕ` в `reference cases/*.md`.

### Env
`NEXTAUTH_SECRET`→`AUTH_SECRET` (keyed-ротация); `NEXTAUTH_URL`→`AUTH_URL/APP_URL` (используется в reset-письмах); сохранить `OPENAI_API_KEY/OPENAI_MODEL` (поиск+импорт), `RESEND_API_KEY/EMAIL_FROM`, `GOOGLE_SITE_VERIFICATION/YANDEX_VERIFICATION/SITE_URL`, storage-переменные; удалить `GOOGLE_API_KEY` (с легаси-Genkit).

### Переиспользовать
zod-схемы (`case-schema.ts` без solution-части — билдер поискового документа уже solution/task-free), `caseBodyToText`, `case-taxonomy`, `storage.ts`, паттерн `PasswordResetToken` (SHA-256 хеш токена, нейтральный анти-энумерация ответ, cooldown ресенда, атомарная инвалидация в `$transaction`) как шаблон для `RefreshToken`, i18n-каталоги.

---

## 14. Приложение Б: состязательная проверка (v2)

5 агентов независимо проверили спеку против реального репо: **39 находок** (2 блокера, ~10 high). Все load-bearing утверждения подтверждены кодом. Вердикт: **направление верное, ядро (Turborepo+tRPC, транспортно-независимый core/db/auth/api, argon2id, embed-on-write гибрид, продуктовый поворот) — сохранить**. Укреплены 4 области:
- **Auth (§5c):** 2 блокера (нет транспорта silent-refresh для web; потеря CSRF при уходе от NextAuth) + high (точка отзыва/`approvedAt`, гонка ротации, oracle `checkLoginIssue`, клиентский слой сессии, keyed-ротация секрета) — **закрыты в §5c**.
- **Масштабирование (§4/§9):** разрешено противоречие принципов; честные предпосылки multi-replica (shared cacheHandler + S3), RSC cache-coherence, standalone-оговорка.
- **Поиск (§6):** реальные durability-примитивы (`embeddingDirty`+воркер); лексика/RRF как net-new; recall-fix; сверка «нет генерации».
- **Инвентарь удаления (§13):** переупорядочен (осиротевшее vs живое coupling), полный список PATIENT/CaseMode, enum-рецепт миграции, правки AI-импорта; добавлены пропущенные подсистемы (баннеры, поддержка, AnnouncementDismissal, SEO-поверхность).
