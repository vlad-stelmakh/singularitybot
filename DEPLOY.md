# Развёртывание Telegram-бота на VPS (Docker)

Бот работает по long-polling — это долгоживущий процесс, а не веб-сервис. Порт наружу открывать не нужно, нужен только исходящий доступ в интернет к `api.telegram.org`, `api.openai.com`, `api.singularity-app.com`, `mcp.singularity-app.com` и, если включён Jira MCP, к вашему сайту Jira Cloud (`*.atlassian.net`).

## Предпосылки

- VPS с Docker и Docker Compose (`curl -fsSL https://get.docker.com | sh`).
- Заполненный файл `.env` (скопируйте из `.env.example`).

## Быстрый старт (Docker Compose)

```bash
git clone <repo-url> singularity-mcp-server
cd singularity-mcp-server

cp .env.example .env
# отредактируйте .env: TELEGRAM_BOT_TOKEN, ALLOWED_USER_IDS,
# OPENAI_API_KEY, SINGULARITY_ACCESS_TOKEN

docker compose up -d --build      # собрать и запустить в фоне
docker compose logs -f            # смотреть логи
```

`restart: unless-stopped` в `docker-compose.yml` перезапускает контейнер при падении и после перезагрузки VPS.

## Обновление до новой версии

```bash
git pull
docker compose up -d --build
```

## Полезные команды

```bash
docker compose ps        # статус
docker compose restart   # перезапуск
docker compose down      # остановить и удалить контейнер
```

## Без Compose (чистый Docker)

```bash
docker build -t singularity-mcp-server:latest .
docker run -d --name singularity-bot --restart unless-stopped \
  --env-file .env singularity-mcp-server:latest
```

## Заметки

- Отдельный MCP-сервер запускать не нужно: бот подключается к официальному `https://mcp.singularity-app.com/mcp`. Если hosted MCP отклонит API-токен, бот порождает `mcp.js` как дочерний процесс по stdio. Если в `.env` заданы `JIRA_BASE_URL`, `JIRA_EMAIL` и `JIRA_API_TOKEN`, бот так же поднимает `jira-mcp.js`.
- Сборки/транспиляции нет: `node` запускает файлы напрямую.
- `.env` не попадает в образ (исключён в `.dockerignore`) и подключается на рантайме через `env_file`. Поэтому `docker exec singularity-bot npm run migrate-legacy-env` не увидит файл. Миграцию запускайте на хосте:

  ```bash
  npm run migrate-legacy-env -- .env .env.migrated
  ```

  Если Node.js на хосте нет, смонтируйте каталог в одноразовый контейнер:

  ```bash
  docker run --rm --user "$(id -u):$(id -g)" --entrypoint node \
    -v "$PWD:/work" -w /work \
    singularity-mcp-server:latest \
    /app/scripts/migrate-legacy-env.js .env .env.migrated
  ```

  Проверьте `.env.migrated`, замените им `.env` и пересоздайте контейнер: `docker compose up -d --force-recreate`.
