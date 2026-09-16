# AGENTS.md

## Cursor Cloud specific instructions

Проект `singularity-mcp-server` — набор из трёх запускаемых компонентов на Node.js (CommonJS, `node >=18`; на VM установлен Node 22). Пакетный менеджер — **npm** (`package-lock.json`). Зависимости обновляются скриптом запуска (`npm ci`); отдельно ставить их не нужно.

### Компоненты и как их запускать

Команды в `package.json`:

- `npm start` / `npm run mcp` → `node mcp.js` — **локальный MCP-сервер по stdio** (запасной вариант; тулзы для SingularityApp API). Это долгоживущий процесс, который общается по stdin/stdout по протоколу MCP (JSON-RPC) — его **не запускают для ручного взаимодействия в терминале**, а подключают из MCP-клиента.
- `npm run jira-mcp` → `node jira-mcp.js` — **опциональный read-only MCP-сервер Jira** по stdio. Бот поднимает его сам, если заданы `JIRA_BASE_URL`, `JIRA_EMAIL` и `JIRA_API_TOKEN`.
- `npm run bot` → `node bot/index.js` — **Telegram-бот** (главный пользовательский интерфейс). По умолчанию подключается к официальному MCP `https://mcp.singularity-app.com/mcp` по Streamable HTTP. Если hosted MCP отклоняет API-токен, бот порождает `mcp.js` как дочерний процесс. Долгоживущий (long-polling) — запускать в фоне/tmux.
- `npm run http-server` → `node http-server.js` — **опциональный** Express-сервер (порт `PORT`, по умолчанию 3000). Полезен только эндпоинт `GET /health`; `POST /mcp` — это mock-транспорт (`MockStreamableHTTPServerTransport`) и вернёт "Внутренняя ошибка сервера" (это не баг окружения). Запускается в demo-режиме без токена: `DEMO_MODE=true npm run http-server`.

### Неочевидные моменты

- **Сборки нет.** Файлы (`*.js`) — уже транспилированный вывод; комментарии про `npm run build` и папку `dist/` в `http-server.js`/`mcp.js` устаревшие. Запуск идёт напрямую через `node`, шага build не существует.
- **Тесты:** `npm test` (`node --test`). Линтера и CI в репозитории нет.
- **Токен MCP-сервера:** бот передаёт ключ пользователя в официальный MCP как `Authorization: Bearer`. Локальный `mcp.js` берёт `--accessToken` из аргументов командной строки (или использует захардкоженный fallback-токен), а **не** из переменных окружения. Переменные окружения (`SINGULARITY_ACCESS_TOKEN`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS`, `JIRA_*`, `SINGULARITY_MCP_URL` и т.д.) читает конфиг бота `bot/config.js` (через `dotenv`). Для прямого запуска локального MCP как клиент передавайте токен так: `node mcp.js --accessToken "$SINGULARITY_ACCESS_TOKEN" -n`. `jira-mcp.js` принимает `--baseUrl/--email/--apiToken` или те же значения из env.
- **Секреты** для полной функциональности задаются через переменные окружения (в Cloud — раздел Secrets): `TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS` (иначе бот отказывает всем), `OPENAI_API_KEY`, `SINGULARITY_ACCESS_TOKEN`. Для Jira (необязательно): `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`. Локальная конфигурация — копия `.env.example` → `.env` (`.env` в `.gitignore`).
- Реальные операции требуют доступа в интернет к внешним API: `api.singularity-app.com`, `api.openai.com`, `api.telegram.org`, при включённом Jira — `*.atlassian.net`.
