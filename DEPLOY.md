# MEDIZO — Deployment guide (`docjob.sanduai.kz`)

Self-hosted production deploy on a single Linux VPS using Docker Compose + Caddy. Final URL: `https://docjob.sanduai.kz`.

The repo already contains everything you need:

- `Dockerfile` — multi-stage build for Next.js + Prisma.
- `docker-compose.yml` — Postgres 16 + the web app.
- `docker-compose.prod.yml` — overlay that locks public ports so only Caddy can reach the app.
- `deploy/Caddyfile.example` — sample reverse proxy with auto HTTPS.
- `prisma/migrations/*` — schema migrations applied automatically by the web container at boot (`npx prisma migrate deploy`).

## 0. Prerequisites

- A Linux server (Ubuntu 22.04 / 24.04 recommended) with root or sudo access.
- A domain you control. We will add one DNS record for `docjob.sanduai.kz`.
- Your OpenAI API key.

Server packages we will install: Docker Engine, Docker Compose plugin, Caddy, Git.

## 1. DNS

In your DNS provider for `sanduai.kz`, add an `A` record:

| Name    | Type | Value          |
|---------|------|----------------|
| docjob  | A    | <SERVER_IPv4>  |

If your server has IPv6, also add an `AAAA` record with the same name. Wait 1–5 minutes for propagation. Verify from your laptop:

```bash
dig +short docjob.sanduai.kz
# expected: <SERVER_IPv4>
```

## 2. SSH into the server

```bash
ssh root@<SERVER_IPv4>
# or: ssh ubuntu@<SERVER_IPv4>
```

If you log in as a non-root user, prefix the install commands below with `sudo`.

## 3. Install Docker + Compose

```bash
apt update
apt install -y ca-certificates curl gnupg git

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

docker --version
docker compose version
```

## 4. Install Caddy

Caddy will terminate TLS and reverse-proxy to the Next.js container on `127.0.0.1:3000`.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list

apt update
apt install -y caddy

systemctl enable --now caddy
```

## 5. Clone the repo

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/Kirirto-kun/MEDIZO_AI_HACKATHON.git medizo
cd medizo
```

## 6. Create the production `.env`

`docker compose` reads `.env` (not `.env.local`) for variable substitution. Generate a strong NextAuth secret and your Postgres password, then create `.env`:

```bash
NEXTAUTH_SECRET=$(openssl rand -base64 48)
POSTGRES_PASSWORD=$(openssl rand -base64 24)
cat > .env <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=https://docjob.sanduai.kz
AUTH_TRUST_HOST=true

# OpenAI — used by the chat-bot and markdown import
OPENAI_API_KEY=sk-... # paste your real key here
OPENAI_MODEL=gpt-4.1
EOF
chmod 600 .env
cat .env
```

Edit `OPENAI_API_KEY` to your actual key. Save the file (`vim .env` or `nano .env`).

## 7. Configure Caddy

```bash
cp deploy/Caddyfile.example /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

The first time Caddy serves `docjob.sanduai.kz`, it will fetch a Let's Encrypt cert automatically. Make sure:

- Ports 80 and 443 are open in your firewall (for `ufw`: `ufw allow 80,443/tcp`).
- The DNS record from step 1 already resolves on this machine: `getent hosts docjob.sanduai.kz`.

## 8. Build and start the app

```bash
cd /opt/medizo
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

What happens:

1. Postgres 16 starts, seeded by Compose with user `medizo`, database `medizo`, password from `.env`.
2. The web image builds (one-time, ~2–4 minutes).
3. The web container starts, runs `npx prisma migrate deploy` against Postgres, then `npm run start` on port 3000.
4. Caddy proxies `https://docjob.sanduai.kz` → `127.0.0.1:3000` and serves a fresh TLS cert.

Watch the logs:

```bash
docker compose logs -f web
```

You should see `prisma migrate deploy` finishing without errors, then Next.js: `Ready - started server on 0.0.0.0:3000`.

## 9. Seed an admin account

Inside the web container, run the seed script. It creates `admin@medizo.local` (password `password123`), a demo doctor, 4 demo cases, and tags.

```bash
docker compose exec web npx tsx prisma/seed.ts
```

Open `https://docjob.sanduai.kz/login`, sign in as `admin@medizo.local` / `password123`, then immediately go to **Profile** and change the password — or create a new admin via Prisma Studio:

```bash
docker compose exec web npx prisma studio
# (then SSH-tunnel port 5555 from your laptop if you want the GUI)
```

## 10. Verify everything works

From your laptop:

```bash
curl -I https://docjob.sanduai.kz
# expected: HTTP/2 200 (or 302 to /login) and Server: Caddy

curl -s -o /dev/null -w "%{http_code}\n" https://docjob.sanduai.kz/login
# expected: 200
```

Then in your browser:

1. `https://docjob.sanduai.kz/login` — log in as admin.
2. Go to `/select-subgroup` → pick `Кейсы клинических инцидентов` → open one of the seeded cases.
3. The chat on the right should greet you in Russian (this is the live OpenAI call, so it tests `OPENAI_API_KEY`).
4. Send a message, then click **Финальный ответ** to verify evaluation.
5. Open `/new-case` to verify the BlockNote editor + the **Файлы** tab work. Upload a PDF and a PNG with title/description.

## 11. Updating the app

Whenever you push new commits to `main` on GitHub:

```bash
cd /opt/medizo
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Migrations run on container start, so schema changes apply automatically.

## 12. Backups

The data lives in two Docker volumes:

```bash
docker volume ls | grep medizo
# medizo_postgres_data   → Postgres data
# medizo_uploads         → uploaded attachments
```

Daily backup script (drop into `/root/backup-medizo.sh` and `chmod +x`):

```bash
#!/usr/bin/env bash
set -euo pipefail
DATE=$(date +%F)
BACKUP_DIR=/var/backups/medizo
mkdir -p "$BACKUP_DIR"

docker compose -f /opt/medizo/docker-compose.yml -f /opt/medizo/docker-compose.prod.yml exec -T postgres \
    pg_dump -U medizo medizo | gzip > "$BACKUP_DIR/medizo-db-$DATE.sql.gz"

docker run --rm -v medizo_uploads:/data -v "$BACKUP_DIR":/backup alpine \
    tar czf "/backup/medizo-uploads-$DATE.tgz" -C /data .

# Keep last 14 days
find "$BACKUP_DIR" -type f -mtime +14 -delete
```

Add to cron: `crontab -e` →

```
30 3 * * * /root/backup-medizo.sh >> /var/log/medizo-backup.log 2>&1
```

## 13. Common troubleshooting

- **Caddy `unable to obtain certificate`** — DNS not pointing to this server yet, or ports 80/443 are blocked. Run `dig docjob.sanduai.kz` and `ufw status`.
- **502 from Caddy** — web container is not running or crashed. `docker compose logs web --tail=200`.
- **NextAuth `Untrusted host`** — `NEXTAUTH_URL` does not match the public URL exactly. Edit `.env`, set `NEXTAUTH_URL=https://docjob.sanduai.kz`, then `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.
- **OpenAI errors in chat** — open `docker compose logs web | grep -i openai`. Most often: empty `OPENAI_API_KEY`, expired key, or wrong model name. The default model is `gpt-4.1`; switch via `.env` if needed.
- **Disk filling up from uploads** — files live in the `medizo_uploads` volume. Move it to a larger partition or wire S3 (`src/lib/storage.ts` is the integration point).
- **Need to reset everything** — `docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v` (the `-v` deletes volumes — use only for a clean wipe).

## 14. Optional: run import of reference cases

If you want the long-form clinical cases from `cases/*.md` populated as Cases (uses OpenAI):

```bash
docker compose exec web npm run import:cases
```

It reads `cases/*.md`, structures each through OpenAI, and inserts them as `CLINICAL_QUEST` cases owned by the first `ADMIN` user. Idempotent by case name.
