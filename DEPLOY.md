# DocJob — Deployment Runbook

This is the single source of truth for deploying DocJob to a production VPS.
It assumes the SP-5 infra work: a pnpm/Turborepo-aware production
`Dockerfile` (Next.js standalone), a `docker-compose.yml` stack
(`postgres` + `web` + `worker` + optional `redis`), `/api/health`, and the
Nginx/backup config under `deploy/`.

**You (the operator) perform every step below** — nothing here deploys
automatically. See ["What needs your accounts/domain/money"](#what-needs-your-accountsdomainmoney)
for the parts that require something only you can provide.

```
Internet ── 443/80 ──> Nginx (host) ──127.0.0.1:3000──> web (Docker, Next.js)
                                                            │
                                                            ├── worker (Docker, embed sweep)
                                                            │
                                                            └── postgres (Docker, pgvector)
                                                                  (+ optional redis, Docker)
```

- `web` and `postgres` are published to **loopback only** — Nginx on the host
  is the only public entry point.
- `worker` has no published port at all (it only talks to Postgres + OpenAI).
- Docker volumes `postgres_data` and `uploads` persist across
  rebuilds/restarts; only `docker compose down -v` (note the `-v`) destroys
  them.

---

## 1. Prerequisites

- **A VPS.** Minimum realistic spec: 2 vCPU / 4 GB RAM / 40 GB SSD (Postgres +
  the Next.js server + the embed worker all run on one box). Ubuntu 22.04 or
  24.04 LTS is assumed below; the commands are the same on Debian, substitute
  `dnf`/`yum` on RHEL-family distros.
- **Docker Engine + the Compose plugin** (`docker compose`, not the standalone
  `docker-compose` v1 binary — this repo's compose file uses `profiles:`,
  which needs Compose v2).
  ```bash
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"   # log out/in (or `newgrp docker`) after this
  docker compose version            # confirm v2.x
  ```
- **A domain name**, with an **A record** (and `www` A/CNAME, if you want
  `www.` too) pointing at the VPS's public IP. TLS (step 6) cannot succeed
  until DNS resolves to this server:
  ```bash
  curl -s ifconfig.me ; echo         # this server's public IP
  dig +short docjob.example.com      # should return the same IP
  ```
- **Firewall**: only SSH, HTTP, and HTTPS need to be reachable from the
  internet. Postgres and the app port (3000) are already loopback-only in
  `docker-compose.yml` — don't additionally punch a hole for them.
  ```bash
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
  ```
- **Repo access** — clone over HTTPS with a personal access token, or set up
  a read-only deploy key, per your usual GitHub access pattern.
- **An OpenAI API key with balance** (semantic search + embeddings +
  markdown case import). The app degrades gracefully without one (search
  falls back to plain lexical/FTS matching), but it's a materially worse
  product without it.

---

## 2. First-time setup

```bash
sudo mkdir -p /opt/docjob && sudo chown "$USER":"$USER" /opt/docjob
git clone <your-repo-url> /opt/docjob
cd /opt/docjob
cp .env.example .env
```

`docker compose` reads **`.env`** (not `.env.local` — that's the local-dev
file; see `CLAUDE.md`). Edit `/opt/docjob/.env` and set at minimum:

| Variable | What to put | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | a strong random password | `openssl rand -hex 16` |
| `AUTH_SECRET` | a strong random secret | `openssl rand -base64 48` — signs every access/refresh JWT. **Never reuse the dev value.** |
| `AUTH_URL` | `https://docjob.example.com` | your real domain, `https://`, no trailing slash. Also the CSRF same-origin source of truth (`apps/web/src/lib/csrf.ts`). |
| `PASSWORD_RESET_URL_BASE` | usually leave unset | falls back to `AUTH_URL`; only set it separately if reset links should point at a different host than the API origin (e.g. a marketing domain). |
| `OPENAI_API_KEY` | your OpenAI key | leave blank to run search in FTS/lexical-fallback-only mode. |
| `RESEND_API_KEY` / `EMAIL_FROM` | your Resend key / a verified sender | leave `RESEND_API_KEY` blank to log password-reset/contact emails to the container's stdout instead of sending them (fine for a first smoke test, not for real users). `EMAIL_FROM`'s domain must be verified in Resend. |
| `NEXT_PUBLIC_SITE_URL` | `https://docjob.example.com` | canonical links / sitemap / Open Graph. **This is a build ARG, not a runtime env var** — `docker-compose.yml` passes it into `web`'s `build.args`, and Next.js inlines `NEXT_PUBLIC_*` vars into the bundle at `next build` time only (never read at container runtime). Set it in `.env` **before** first building, and any time you change it afterwards you must rebuild — `docker compose up -d --build web` (a plain restart will NOT pick it up, since the old value is already baked into the image). |
| `POSTGRES_HOST_PORT` | `5433` (default) | only change if that host port is already taken; not exposed publicly either way. |

Everything else in `.env.example` has a safe default or is optional
(`GOOGLE_SITE_VERIFICATION`, `YANDEX_VERIFICATION`, `REDIS_URL` — see
[Scaling](#8-scaling-redis--multiple-web-instances) — `REEMBED_INTERVAL_MS`,
`ADMIN_EMAIL`/`ADMIN_PASSWORD` for the seed step below).

`.env` is git-ignored — it never leaves this server.

---

## 3. Bring up the stack

```bash
cd /opt/docjob
docker compose up -d
```

This builds the image (first run: a few minutes — installs the full pnpm
workspace, generates the Prisma client, runs `next build`) and starts
`postgres`, `web`, and `worker`. `web`'s container `CMD` runs
`prisma migrate deploy` (applying every migration, including the pgvector and
full-text-search ones) before starting the Next.js server, so the schema is
always current on boot — no separate migration step needed.

Verify:

```bash
docker compose ps                                             # postgres/web/worker all Up (postgres "healthy")
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health   # 200
docker compose logs web --tail 30                              # "Ready in ...", no errors
docker compose logs worker --tail 10                           # "[reembed] processed=..." sweep lines
```

Redis is **off by default** — every rate-limiter and the query-embedding
cache use a correct in-memory implementation that's fine for a single `web`
instance. Don't start it unless you're doing the [multi-instance scale-out](#8-scaling-redis--multiple-web-instances) below.

---

## 4. One-time bootstrap (admin user + case data)

**Important:** run these against the **`worker`** service, not `web`. `web`
runs the minimal Next.js standalone image (no `pnpm`, no `tsx`, no workspace
source beyond the Prisma schema/migrations — see the Dockerfile's `runner`
stage). `worker` runs the full `build`-stage image (complete monorepo source
+ dev tooling), which is what these scripts need.

```bash
cd /opt/docjob

# Admin (+ demo doctor/reviewer, tags, demo cases). Re-run any time — it's
# idempotent by email; ADMIN_PASSWORD is only (re)hashed when you pass it, so
# omitting it on a re-seed leaves the existing password alone. Quote the
# password so the shell doesn't touch `$`/`!` in it.
docker compose exec \
  -e ADMIN_EMAIL='you@yourdomain.com' \
  -e ADMIN_PASSWORD='a-strong-password' \
  worker pnpm --filter @docjob/db db:seed:prod

# Bulk-import the reference markdown cases (idempotent by case name).
docker compose exec worker pnpm --filter web import:cases

# Backfill pgvector embeddings for every case without one (needs a working
# OPENAI_API_KEY — skip/re-run later if you added the key after the fact).
docker compose exec worker pnpm --filter web embed:cases
```

The demo doctor/reviewer accounts seeded alongside the admin
(`doctor@docjob.local` / `reviewer@docjob.local`, both `password123`) are for
smoke-testing only — **change or delete them** before real users register.
If a prior seed created the default `admin@docjob.local` and you don't want
it around:

```bash
docker compose exec -T postgres psql -U docjob -d docjob \
  -c "DELETE FROM \"User\" WHERE email='admin@docjob.local';"
```

---

## 5. Nginx + TLS

Install Nginx and certbot. Only the core `certbot` package is needed — the
webroot bootstrap below deliberately avoids `python3-certbot-nginx` (the
`certbot --nginx` plugin edits the live vhost in place, which is unsafe for
this config; see the bootstrap note below):

```bash
sudo apt update && sudo apt -y install nginx certbot
sudo mkdir -p /var/www/certbot
```

Copy the config and replace the placeholder domain **everywhere it appears**
(`server_name` in both server blocks, plus both `ssl_certificate*` paths):

```bash
sudo cp /opt/docjob/deploy/nginx/docjob.conf /etc/nginx/sites-available/docjob.conf
sudo sed -i 's/docjob\.example\.com/docjob.YOUR-REAL-DOMAIN/g' /etc/nginx/sites-available/docjob.conf
sudo ln -sf /etc/nginx/sites-available/docjob.conf /etc/nginx/sites-enabled/docjob.conf
sudo rm -f /etc/nginx/sites-enabled/default
```

**Bootstrap order matters, and `certbot --nginx` is the WRONG tool here** —
it edits the matched vhost's config in place, and the port-80 block's
`location /` is a redirect-only `return 301 https://$host$request_uri;` (no
`proxy_pass`). If `certbot --nginx` were run against it, it would add
`listen 443 ssl` directly to that redirect-only block, so the resulting
HTTPS listener would inherit the unconditional `return 301` — an infinite
redirect loop on every `https://` request. Use the **webroot** method
instead, which obtains the certificate over plain HTTP without touching
nginx's config at all:

```bash
# 1. Create the webroot certbot will drop its ACME challenge files into.
#    deploy/nginx/docjob.conf's port-80 block already serves this path via
#    `location /.well-known/acme-challenge/ { root /var/www/certbot; }`.
sudo mkdir -p /var/www/certbot

# 2. Temporarily comment out the whole second `server { listen 443 ssl ...` block
#    (everything from the second `server {` to its matching closing `}`) in
#    /etc/nginx/sites-enabled/docjob.conf, so nginx can start even though the
#    cert files it references don't exist yet.
sudo nginx -t && sudo systemctl reload nginx

# sanity check the HTTP block is alive before asking Let's Encrypt for
# anything — with the 443 block still commented out, every path (including
# /api/health) hits the port-80 catch-all `location /`, which is a redirect,
# not the app itself:
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: docjob.YOUR-REAL-DOMAIN" http://127.0.0.1/api/health   # 301

# 3. Obtain the certificate via the webroot plugin. This ONLY writes cert
#    files under /etc/letsencrypt/ — it never edits nginx's config, so there
#    is no risk of it redirect-looping the 443 block.
sudo certbot certonly --webroot -w /var/www/certbot \
  -d docjob.YOUR-REAL-DOMAIN -d www.docjob.YOUR-REAL-DOMAIN

# 4. Uncomment the 443 block you commented out in step 2 (it already has the
#    correct proxy_pass, security headers, and the standard certbot cert
#    paths — nothing left to edit) and reload:
sudo nginx -t && sudo systemctl reload nginx

# now the real app answers on both ports:
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/api/health                                        # 301 (redirect, as before)
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: docjob.YOUR-REAL-DOMAIN" https://127.0.0.1/api/health -k  # 200
```

Certbot will ask for an email + ToS agreement on first run. Set up renewal —
the webroot plugin re-uses the same `-w /var/www/certbot` on every renewal,
so the standard certbot-installed systemd timer / cron job works with no
extra config; this just dry-runs it:

```bash
sudo certbot renew --dry-run
```

Final check:

```bash
curl -sI https://docjob.YOUR-REAL-DOMAIN/api/health | head -n 1   # HTTP/2 200 (or HTTP/1.1 200)
```

---

## 6. Health monitoring

`apps/web/src/app/api/health/route.ts` is a cheap, unauthenticated
`GET /api/health` that runs `SELECT 1` against Postgres with a 2.5s timeout —
`200 {"status":"ok","db":"up",...}` when healthy, `503
{"status":"degraded","db":"down",...}` when the DB is unreachable. Three
things already poll it:

1. **Docker's own healthcheck** on the `web` service (`docker compose ps`
   shows `(healthy)`/`(unhealthy)`).
2. **Nginx** proxies `/api/health` (see `deploy/nginx/docjob.conf`) —
   point any external uptime monitor (UptimeRobot, Better Stack, a simple
   cron `curl` + alert, etc.) at `https://docjob.YOUR-REAL-DOMAIN/api/health`.
3. You, manually: `docker compose ps` / `curl .../api/health`.

**Logs:**

```bash
docker compose logs -f web        # request/error logs (structured JSON via apps/web/src/lib/logger.ts)
docker compose logs -f worker     # "[reembed] processed=X embedded=Y skipped=Z failed=W" per sweep
docker compose logs -f postgres
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
```

---

## 7. Backups + restore

Scripts live in `deploy/backup/` (both are POSIX `sh`, no bashisms):

- `pg-backup.sh` — `pg_dump`s the `postgres` service to a gzip-compressed,
  timestamped file under `<repo>/backups/`, rotates to the last 14 by
  default (`PG_BACKUP_KEEP` to override).
- `uploads-backup.sh` — tars the `uploads` Docker volume (case
  attachments/images) to `<repo>/backups/`, same rotation
  (`UPLOADS_BACKUP_KEEP`).

Run manually once to sanity-check:

```bash
cd /opt/docjob
./deploy/backup/pg-backup.sh
./deploy/backup/uploads-backup.sh
ls -lh backups/
```

Then cron them — see `deploy/backup/crontab.example` (daily, staggered,
5 minutes apart):

```bash
crontab -e
# paste the two lines from deploy/backup/crontab.example, with the path
# adjusted to /opt/docjob if you cloned somewhere else
```

Consider also copying `backups/` off-box periodically (e.g. `rsync`/`rclone`
to object storage) — these scripts only protect against data loss on *this*
disk, not the disk itself dying.

### Restore

**Postgres** (⚠️ this replaces all current data in the `docjob` database):

```bash
cd /opt/docjob
docker compose down web worker         # stop writers so the restore isn't racing live traffic
gunzip -c backups/docjob-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T postgres psql -U docjob -d docjob
docker compose up -d web worker
```

If the target database isn't empty, drop and recreate it first (also
destructive — only do this on a genuinely broken/empty environment):

```bash
docker compose exec -T postgres psql -U docjob -d postgres \
  -c 'DROP DATABASE docjob;' -c 'CREATE DATABASE docjob OWNER docjob;'
```

**Uploads:**

```bash
cd /opt/docjob
docker compose down web
VOLUME=$(docker volume ls --filter "label=com.docker.compose.volume=uploads" --format '{{.Name}}')
docker run --rm -v "$VOLUME:/data" -v "$(pwd)/backups:/backup" alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/uploads-YYYYMMDD-HHMMSS.tar.gz -C /data"
docker compose up -d web
```

---

## 8. `AUTH_SECRET` rotation

Rotating `AUTH_SECRET` without the overlap window would instantly invalidate
every logged-in user's session. `AUTH_SECRET_PREVIOUS` avoids that: access
tokens signed with the old secret keep verifying (via a `kid: 'previous'`
tag) until they naturally expire (~15 minutes).

```bash
cd /opt/docjob
OLD_SECRET=$(grep '^AUTH_SECRET=' .env | cut -d= -f2-)
NEW_SECRET=$(openssl rand -base64 48)

# In .env: set AUTH_SECRET to $NEW_SECRET, and AUTH_SECRET_PREVIOUS to $OLD_SECRET.
# (edit by hand, or with sed — be careful with special characters in the secrets)

docker compose up -d web     # recreate just `web` with the new env (worker doesn't use AUTH_SECRET)
```

Wait at least 15 minutes (the access-token TTL) for every outstanding old
token to expire naturally, then remove `AUTH_SECRET_PREVIOUS` from `.env`
entirely and `docker compose up -d web` once more. Don't leave
`AUTH_SECRET_PREVIOUS` set indefinitely — it's only meant for the rotation
window.

---

## 9. Scaling: Redis + multiple `web` instances

Everything up to here runs correctly as a single `web` instance with
in-memory rate-limiters and query cache. If you need more than one `web`
instance (higher traffic, zero-downtime deploys via a blue/green swap, etc.),
those in-memory structures stop being correct — each instance would keep an
independent counter/cache — so bring Redis in first:

```bash
# Add REDIS_URL to .env, e.g.:
#   REDIS_URL="redis://redis:6379"
docker compose --profile redis up -d
```

With `REDIS_URL` set, the login rate-limiter, the search rate-limiter, the
password-reset rate-limiter, and the query-embedding cache all switch to
their Redis-backed adapters automatically (see `packages/config`'s
`getRedis()` and the adapters in `packages/auth`/`packages/api`/
`packages/core` — selected at runtime, no code change needed). Unset
`REDIS_URL` (or stop the `redis` service) any time to fall back to in-memory
— safe for a single instance, incorrect across multiple.

Note: with `REDIS_URL` set, the rate-limiters (login/search/reset) fail
**open** during a Redis outage — a Redis blip temporarily disables
rate-limiting rather than locking users out (availability over strictness).
The in-memory default (no `REDIS_URL`) is unaffected by this tradeoff.

**Running multiple `web` instances:** `docker-compose.yml`'s `web` service
binds a fixed host port (`127.0.0.1:3000:3000`), so `docker compose up -d
--scale web=N` won't work as-is (every replica would fight over the same
port). The straightforward path is a small compose override defining
additional instances on their own loopback ports, e.g. a
`docker-compose.scale.yml`:

```yaml
services:
  web2:
    extends:
      file: docker-compose.yml
      service: web
    ports:
      - "127.0.0.1:3001:3000"
  web3:
    extends:
      file: docker-compose.yml
      service: web
    ports:
      - "127.0.0.1:3002:3000"
```

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d
```

Then point Nginx at all instances with an `upstream` block in place of the
single `proxy_pass http://127.0.0.1:3000` in `deploy/nginx/docjob.conf`:

```nginx
upstream docjob_web {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}
# ...then proxy_pass http://docjob_web; in each `location` block instead.
```

Make sure `REDIS_URL` is set on **every** `web`/`worker`/`web2`/`web3`
instance before scaling out — running multiple instances with in-memory
limiters still silently "works" (no crash), it just stops actually
rate-limiting or caching correctly across instances.

---

## 10. Updating

```bash
cd /opt/docjob
git pull
docker compose up -d --build      # rebuilds the image, applies pending migrations on `web`'s boot, restarts web+worker
```

If new cases were added and need embeddings:

```bash
docker compose exec worker pnpm --filter web embed:cases
```

---

## 11. Useful commands

```bash
docker compose ps
docker compose logs -f web
docker compose restart web
docker compose down                 # stop everything, KEEP volumes (data safe)
docker compose down -v              # ⚠️ stop everything AND delete volumes (destroys DB + uploads)
docker compose exec postgres psql -U docjob -d docjob
```

---

## 12. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `certbot` "challenge failed" | DNS doesn't point here yet, or port 80 isn't reachable. Check `dig +short docjob.YOUR-REAL-DOMAIN` and `sudo ufw status`. |
| Site works on http, not https | The cert doesn't exist yet, or the 443 block was never uncommented/reloaded after obtaining it. Re-run `sudo certbot certonly --webroot -w /var/www/certbot -d ... -d ...`, then uncomment the 443 block and `sudo nginx -t && sudo systemctl reload nginx`. Don't use `certbot --nginx` — it edits the redirect-only port-80 block in place and causes an https:// redirect loop (see §5). |
| `502 Bad Gateway` | `web` container isn't up/healthy. `docker compose ps`, `docker compose logs web`. |
| `413 Request Entity Too Large` on attachment upload | Confirm you copied `deploy/nginx/docjob.conf` (has `client_max_body_size 30m;`) and reloaded nginx (`sudo nginx -t && sudo systemctl reload nginx`). |
| Search returns nothing useful / "no results" | No embeddings yet, or no/invalid `OPENAI_API_KEY`. `docker compose exec worker pnpm --filter web embed:cases`; check `docker compose logs worker` for `insufficient_quota` or auth errors. |
| `web` fails on boot with a Prisma auth error | `POSTGRES_PASSWORD` in `.env` doesn't match the password baked into the existing `postgres_data` volume (e.g. you changed it after first boot). If the DB is disposable: `docker compose down -v` and start over (⚠️ destroys data) — otherwise restore the old password. |
| Login/reset suddenly rejecting everyone with a CSRF error | `AUTH_URL` doesn't match the domain you're actually serving from, or Nginx isn't forwarding `Host`/`X-Forwarded-Proto` (see the header-rationale comment atop `deploy/nginx/docjob.conf`). |
| Everyone behind one office/NAT gets rate-limited together | Nginx isn't forwarding `X-Forwarded-For`/`X-Real-IP` correctly, so the login rate-limiter (`packages/auth/src/login.service.ts`) sees one IP for every request. Confirm the `proxy_set_header` lines are present and unmodified. |

---

## What needs YOUR accounts/domain/money

Nothing in this repo can provision these for you — they require your own
identity, payment method, or property:

- **A domain name + DNS** — you own/register it and point an A record at the
  VPS. (Ongoing cost: domain registration, typically ~$10-15/yr.)
- **The VPS itself** — a server from any provider (Hetzner, DigitalOcean,
  Vultr, etc.). Ongoing monthly cost depends on the provider/spec.
- **The TLS certificate** — free via Let's Encrypt/certbot, but issuance is
  gated on the domain above already resolving to this server.
- **An OpenAI API key** — https://platform.openai.com, pay-as-you-go, funds
  hybrid case search (embeddings + query understanding) and the markdown
  case-import flow. The app runs without one (plain lexical search fallback),
  but that's a materially degraded product.
- **A Resend API key + a verified sending domain** — https://resend.com,
  needed for password-reset and contact emails to actually be delivered
  (without it, the app just logs the email content to the container's stdout
  instead of sending — fine for testing, not for real users).
- **For the mobile app** (`apps/mobile/`, not deployed by anything in this
  document — see `apps/mobile/README.md` for the full mobile build/release
  process): an **Expo/EAS account** (free tier covers dev/preview builds), an
  **Apple Developer Program membership** (**$99/year**, required for any iOS
  build beyond a simulator and mandatory for TestFlight/App Store
  distribution), and a **Google Play Developer account** (**$25 one-time**,
  required to publish to the Play Store). Store listing assets (screenshots,
  privacy policy URL, description, content rating, data-safety form) are
  first-party business/legal content only you can provide.
