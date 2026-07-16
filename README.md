
# DocJob

**Курируемая библиотека клинических кейсов.** Админы создают/импортируют кейсы (клинические инциденты, санитарно-эпидемиологические расследования, лучшие практики, управленческие кейсы), врачи ищут их через AI-поиск (гибрид pgvector + LLM), сохраняют, оставляют отзывы и предлагают новые кейсы через воркфлоу заявок. Никакого чата/тьютора — только библиотека и поиск.

## Tech stack

- **Framework**: Next.js 15 (App Router, Server Actions + tRPC)
- **Language**: TypeScript
- **UI**: Tailwind 3 + shadcn/ui + BlockNote (редактор кейсов)
- **DB**: PostgreSQL 16 + pgvector + Prisma ORM
- **Auth**: кастомный JWT-auth (`@docjob/auth`) — argon2id-хэширование паролей, короткоживущие access-токены (jose) + ротируемые refresh-токены. NextAuth не используется.
- **AI**: OpenAI (`gpt-4.1` + `text-embedding-3-small`) — гибридный семантический поиск по кейсам и markdown-импорт кейсов, оба через `@docjob/core`
- **Локализация**: next-intl (ru / kk)
- **Деплой**: Docker Compose (postgres + web + worker) на VPS — см. [`DEPLOY.md`](DEPLOY.md)

## Quick start (local dev)

Монорепо на pnpm-воркспейсах (`apps/web` + `packages/db`/`config`/`types`).

```bash
# 1. Сервер БД
docker compose --env-file .env.local up -d postgres

# 2. Зависимости + миграции + seed
pnpm install
pnpm --filter @docjob/db db:migrate
pnpm --filter @docjob/db db:seed

# 3. Dev-сервер (все пакеты через turbo)
pnpm dev
```

Другие полезные команды из корня: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint`.

Открой http://localhost:3000. Сидовый админ: `admin@docjob.local` / `password123`.

Подробности деплоя на VPS — см. [`DEPLOY.md`](DEPLOY.md). Архитектура и соглашения — [`CLAUDE.md`](CLAUDE.md). Техническая документация для патента — [`docs/DocJob_Tech_Patent_Documentation.docx`](docs/DocJob_Tech_Patent_Documentation.docx).

## License

MIT.
