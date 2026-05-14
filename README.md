
# DocJob

**AI-симулятор клинических кейсов.** Сократический ассистент проводит обучающегося через клинические инциденты, санитарно-эпидемиологические расследования, лучшие практики и управленческие кейсы — постепенно раскрывая findings по запросу и автоматически оценивая финальный ответ относительно скрытого эталона.

## Tech stack

- **Framework**: Next.js 15 (App Router, Server Actions)
- **Language**: TypeScript
- **UI**: Tailwind 3 + shadcn/ui + BlockNote (редактор кейсов)
- **DB**: PostgreSQL 16 + Prisma ORM
- **Auth**: NextAuth v5 (credentials + JWT + bcrypt)
- **AI**: OpenAI (`gpt-4.1`) через `chat.completions.parse` со строгой Zod-схемой
- **Локализация**: next-intl (ru / kk)
- **Деплой**: Docker Compose (postgres + web), production-overlay через `docker-compose.prod.yml`

## Quick start (local dev)

```bash
# 1. Сервер БД
docker compose --env-file .env.local up -d postgres

# 2. Зависимости + миграции + seed
npm install
npm run db:migrate
npm run db:seed

# 3. Dev-сервер
npm run dev
```

Открой http://localhost:3000. Сидовый админ: `admin@docjob.local` / `password123`.

Подробности деплоя на VPS — см. [`DEPLOY.md`](DEPLOY.md). Архитектура и соглашения — [`CLAUDE.md`](CLAUDE.md). Техническая документация для патента — [`docs/DocJob_Tech_Patent_Documentation.docx`](docs/DocJob_Tech_Patent_Documentation.docx).

## License

MIT.
