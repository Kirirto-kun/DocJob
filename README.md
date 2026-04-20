# Medizo AI 🩺🤖

**Платформа учебных кейсов для врачей и студентов-медиков.** Администратор создаёт клинические кейсы (инциденты, санэпид, лучшие практики, менеджмент); врачи регистрируются, выбирают подгруппу и разбирают кейсы через AI-ассистента.

Проект с хакатона, теперь — open-source. PR-ы приветствуются.

## Стек

- **Next.js 15** App Router (React 18, TypeScript).
- **Postgres 16** через Prisma 5.
- **NextAuth v5** (Credentials + JWT-сессии, bcrypt).
- **Genkit + Gemini 2.5 Flash** для AI-флоу.
- **shadcn/ui + Tailwind** (тёмная тема форс).
- **Docker Compose** для self-host деплоя на VPS.

## Локальный запуск

Требуется Docker Desktop и Node.js 20+.

```bash
git clone https://github.com/Kirirto-kun/MEDIZO_AI_HACKATHON.git
cd MEDIZO_AI_HACKATHON

# 1. Зависимости
npm install

# 2. Переменные окружения
cp .env.example .env.local
# (отредактируйте .env.local если порт 5433 занят — выставьте свой POSTGRES_HOST_PORT
# и синхронно обновите DATABASE_URL)

# 3. Postgres в контейнере
docker compose --env-file .env.local up -d postgres

# 4. Схема + сидданные
npm run db:migrate   # создаст миграцию на пустой БД
npm run db:seed      # admin@medizo.local / password123 + демо-кейсы + теги + новости

# 5. Dev-сервер
npm run dev
# → http://localhost:3000
```

Демо-учётки после сида:
- **Админ**: `admin@medizo.local` / `password123` — создаёт кейсы.
- **Врач**: `doctor@medizo.local` / `password123` — проходит кейсы.

## Продакшн (self-host)

```bash
cp .env.example .env
# отредактировать .env: сильный POSTGRES_PASSWORD,
# NEXTAUTH_SECRET=$(openssl rand -base64 32), NEXTAUTH_URL=https://ваш-домен

docker compose up -d --build
# web-контейнер при старте сам прогонит prisma migrate deploy
docker compose exec web npx tsx prisma/seed.ts   # одноразово для первоначальной БД
```

За nginx/Caddy с TLS. Закройте 5432/5434 наружу, оставьте только 3000.

**Сразу смените пароль сидового админа** или пересоздайте пользователя.

## Полезные npm-скрипты

| Скрипт | Что делает |
|---|---|
| `npm run dev` | Dev-сервер с Turbopack |
| `npm run build` | Production-build (включает `prisma generate`) |
| `npm run start` | Production-сервер после build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Next.js ESLint |
| `npm run db:migrate` | Создать/применить миграции локально |
| `npm run db:deploy` | Применить миграции в проде |
| `npm run db:seed` | Прогнать seed-скрипт |
| `npm run db:studio` | GUI Prisma Studio (localhost:5555) |
| `npm run docker:up` / `docker:down` | Управление compose |

## Архитектура (кратко)

- `src/app/actions.ts` — единственный путь UI → (Prisma \| Genkit).
- `src/hooks/use-user-store.tsx`, `use-patient-store.tsx`, `use-tag-store.tsx` — клиентские сторы поверх server-actions.
- `src/lib/auth.ts` (Node) + `auth.config.ts` (edge) — расщепление для совместимости middleware.
- `src/lib/storage.ts` — изображения кейсов на файловой системе (volume `uploads`).
- `src/ai/flows/*` — Genkit-флоу (`analyze-student-question`, `patient-diagnosis-flow`, и др.).

Полная раскладка — в `CLAUDE.md`.

## Лицензия

MIT.
