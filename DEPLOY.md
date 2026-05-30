# Деплой DocJob на пустой сервер (docjob.kz) — step by step

Полный гайд: от чистого VPS до работающего `https://docjob.kz`.
Стек: **Docker + Postgres (pgvector) + Next.js + Nginx + Let's Encrypt**.

> Гайд для **Ubuntu 22.04 / 24.04** (самый частый VPS). Проверь свою ОС:
> `cat /etc/os-release`. Для Debian команды те же. Для CentOS/Alma/Rocky
> вместо `apt` будет `dnf` — скажи, и я перепишу.

---

## 0. Что нужно заранее

- **IP сервера** и доступ по SSH (root или пользователь с `sudo`).
- **Домен `docjob.kz`** с A-записью на IP сервера (ты уже поменял DNS — проверим в шаге 5).
- **Доступ к репозиторию** `github.com/Kirirto-kun/DocJob` (приватный).
- **OpenAI API-ключ** с балансом (для семантического поиска и эмбеддингов).

> ⚠️ У меня **нет прямого доступа к твоему серверу** (нет SSH-ключей). Поэтому весь код
> я запушил в GitHub (`origin/main`), а ты на сервере его `git clone`-нешь. Все команды
> ниже выполняешь **ты на сервере** (после шага 1).

---

## 1. Подключиться к серверу

С твоего компьютера (Windows PowerShell или любой терминал):

```bash
ssh root@IP_СЕРВЕРА
# или: ssh ТВОЙ_ЮЗЕР@IP_СЕРВЕРА
```

Дальше всё выполняется на сервере.

---

## 2. Обновить систему и базовые пакеты

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl ufw dnsutils
```

Файрвол — открываем только SSH, HTTP, HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

> Порт приложения (3000) и Postgres (5432) наружу НЕ открываем. В проде web слушает
> только `127.0.0.1:3000` (через docker-compose.prod.yml), а Postgres вообще не
> публикуется — оба доступны лишь локально, через Nginx.

---

## 3. Установить Docker + Docker Compose

```bash
# убрать старые версии, если были
sudo apt -y remove docker docker-engine docker.io containerd runc 2>/dev/null || true

# ключ и репозиторий Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Проверка:

```bash
sudo docker --version
sudo docker compose version
```

(Опционально — чтобы не писать `sudo` перед docker; после этого перелогинься по SSH:)

```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

## 4. Подключить GitHub и склонировать репозиторий

Репозиторий приватный → нужен доступ. Рекомендую **Deploy Key** (SSH-ключ только для чтения этого репо).

### 4.1. Сгенерировать SSH-ключ на сервере

```bash
ssh-keygen -t ed25519 -C "docjob-server" -f ~/.ssh/docjob_deploy -N ""
cat ~/.ssh/docjob_deploy.pub
```

Скопируй выведенную строку (`ssh-ed25519 AAAA...`).

### 4.2. Добавить ключ в GitHub

1. Открой `https://github.com/Kirirto-kun/DocJob` → **Settings** → **Deploy keys** → **Add deploy key**.
2. Title: `docjob-server`. Key: вставь строку. **Allow write access** оставь выключенным.
3. **Add key**.

### 4.3. Настроить git и склонировать

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/docjob_deploy
  IdentitiesOnly yes
EOF

ssh -T git@github.com   # ответит "Hi ...! You've successfully authenticated" — это норм

sudo mkdir -p /opt/docjob && sudo chown $USER:$USER /opt/docjob
git clone git@github.com:Kirirto-kun/DocJob.git /opt/docjob
cd /opt/docjob
```

> **Альтернатива (проще)** — HTTPS + Personal Access Token: GitHub → Settings →
> Developer settings → Personal access tokens → Fine-grained → доступ только к этому
> репо (Contents: Read). Затем:
> `git clone https://USERNAME:ТОКЕН@github.com/Kirirto-kun/DocJob.git /opt/docjob`

---

## 5. Проверить, что домен смотрит на сервер

```bash
curl -s ifconfig.me ; echo     # IP этого сервера
dig +short docjob.kz           # должен вернуть тот же IP
dig +short www.docjob.kz       # желательно тот же IP (A или CNAME -> docjob.kz)
```

Если `dig` показывает другой IP или пусто — DNS ещё не обновился (жди до 1–24 ч) или
A-запись неверная. SSL (шаг 9) не выпустится, пока домен не указывает сюда.

---

## 6. Создать файл окружения `.env`

`docker compose` читает **`.env`** (не `.env.local`). Создаём на сервере:

```bash
cd /opt/docjob

cat > .env <<EOF
# --- Postgres ---
POSTGRES_PASSWORD=$(openssl rand -hex 16)

# --- Auth ---
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=https://docjob.kz
AUTH_TRUST_HOST=true

# --- OpenAI (рабочий ключ с балансом) ---
OPENAI_API_KEY=""
OPENAI_MODEL=gpt-4.1
EOF

# впиши OPENAI_API_KEY вручную:
nano .env
```

> `.env` в `.gitignore` — секреты останутся только на сервере. `DATABASE_URL` для
> контейнера web compose собирает сам из `POSTGRES_PASSWORD`.

---

## 7. Поднять приложение (Docker)

Поднимаем с продакшн-оверлеем (Postgres скрыт, web слушает только `127.0.0.1:3000`):

```bash
cd /opt/docjob
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Первый билд ~3–5 минут. Контейнер web при старте сам прогоняет миграции
(включая `CREATE EXTENSION vector`). Проверь:

```bash
docker compose ps                                                      # postgres healthy, web up
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login   # 200
docker compose logs web --tail 30                                      # "Ready in ...", без ошибок
```

### 7.1. Заполнить данные и эмбеддинги

```bash
# админ/доктор/рецензент + теги + 4 демо-кейса
docker compose exec web npm run db:seed:prod

# эмбеддинги для семантического поиска (нужен рабочий OPENAI_API_KEY)
docker compose exec web npm run embed:cases:prod
```

> Используй именно `:prod`-варианты внутри контейнера — обычные `db:seed`/`embed:cases`
> обёрнуты в dotenv и рассчитаны на локальную разработку (.env.local), которого в
> контейнере нет.

Логины по умолчанию (**смени пароль после первого входа**):
- админ: `admin@docjob.local` / `password123`
- доктор: `doctor@docjob.local` / `password123`
- рецензент: `reviewer@docjob.local` / `password123`

---

## 8. Установить и настроить Nginx

```bash
sudo apt -y install nginx

sudo cp /opt/docjob/nginx/docjob.kz.conf /etc/nginx/sites-available/docjob.kz
sudo ln -sf /etc/nginx/sites-available/docjob.kz /etc/nginx/sites-enabled/docjob.kz
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx
```

Проверка по HTTP (пока без сертификата):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: docjob.kz" http://127.0.0.1/login   # 200
```

Открой `http://docjob.kz` в браузере — должно открыться приложение (пока http).

---

## 9. Включить HTTPS (Let's Encrypt, бесплатно, авто-продление)

```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d docjob.kz -d www.docjob.kz
```

Certbot спросит email и согласие, предложит редирект HTTP→HTTPS — **выбери редирект (2)**.
Он сам впишет SSL-блок и перезагрузит nginx.

Проверка авто-продления:

```bash
sudo certbot renew --dry-run
```

Готово — открывай **`https://docjob.kz`** 🎉

---

## 10. Финальная проверка

```bash
curl -sI https://docjob.kz/login | head -n 1     # HTTP/2 200
docker compose ps                                # всё up/healthy
```

В браузере зайди на `https://docjob.kz`, залогинься админом и проверь:
- `/ai-search` — введи «инфаркт миокарда» → возвращаются релевантные кейсы;
- `/admin/announcements` — создай объявление с картинкой и ссылкой;
- открой любой кейс — тело читаемое, светлое.

---

## 11. Обновление приложения (когда появится новое в `main`)

```bash
cd /opt/docjob
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# миграции применятся автоматически при старте контейнера
```

Если добавились новые кейсы и нужны эмбеддинги:
```bash
docker compose exec web npm run embed:cases:prod
```

---

## 12. Полезные команды

```bash
# логи
docker compose logs -f web
docker compose logs -f postgres

# перезапуск web
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart web

# стоп / старт всего стека
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# консоль БД
docker compose exec postgres psql -U docjob -d docjob

# бэкап БД
docker compose exec -T postgres pg_dump -U docjob docjob > backup_$(date +%F).sql

# восстановление из бэкапа
cat backup_2026-05-30.sql | docker compose exec -T postgres psql -U docjob -d docjob
```

---

## 13. Troubleshooting

| Симптом | Причина и решение |
|---|---|
| `certbot` «challenge failed» | Домен ещё не указывает на сервер (шаг 5) или 80 закрыт. Проверь `dig +short docjob.kz` и `sudo ufw status`. |
| Сайт по http есть, по https нет | Certbot не отработал. Повтори `sudo certbot --nginx -d docjob.kz -d www.docjob.kz`. |
| 502 Bad Gateway | Контейнер web не поднят/упал. `docker compose ps`, `docker compose logs web`. |
| 413 при загрузке файла | nginx режет большой файл. В конфиге уже стоит `client_max_body_size 30M;` — проверь, что скопировал именно его, и `sudo systemctl reload nginx`. |
| Поиск «не по смыслу» / пусто | Нет эмбеддингов или нет баланса OpenAI. `docker compose exec web npm run embed:cases:prod`, смотри логи на `insufficient_quota`. |
| web падает `P1000 Authentication failed` | Несовпадение `POSTGRES_PASSWORD` со старым томом БД. Если БД пустая: `docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v` (⚠️ удалит данные) и подними заново. |
| `git pull` просит пароль | Deploy key не подхватился. Проверь `~/.ssh/config` (шаг 4.3) и `ssh -T git@github.com`. |

---

## Архитектура (что где живёт)

```
Интернет ── 443/80 ──> Nginx (хост) ──127.0.0.1:3000──> web (Docker, Next.js)
                                                          │
                                                          └── postgres (Docker, pgvector)
                                                                только внутри docker-сети
```

- **web** опубликован только на `127.0.0.1:3000` → снаружи напрямую недоступен, только через Nginx.
- **postgres** не публикуется на хост → недоступен из интернета.
- Тома Docker: `postgres_data` (БД) и `uploads` (картинки/вложения) переживают пересборку.
- HTTPS-сертификат продлевается автоматически (systemd-таймер certbot).
