# AGENTS.md

## Cursor Cloud specific instructions

Проект `singularity-mcp-server` — набор из трёх запускаемых компонентов на Node.js (CommonJS, `node >=18`; на VM установлен Node 22). Пакетный менеджер — **npm** (`package-lock.json`). Зависимости обновляются скриптом запуска (`npm ci`); отдельно ставить их не нужно.

### Компоненты и как их запускать

Команды в `package.json`:

- `npm start` / `npm run mcp` → `node mcp.js` — **MCP-сервер по stdio** (ядро продукта; тулзы для SingularityApp API). Это долгоживущий процесс, который общается по stdin/stdout по протоколу MCP (JSON-RPC) — его **не запускают для ручного взаимодействия в терминале**, а подключают из MCP-клиента (Claude Desktop, тесты, или бот).
- `npm run bot` → `node bot/index.js` — **Telegram-бот** (главный пользовательский интерфейс). Сам порождает `mcp.js` как дочерний процесс по stdio, так что отдельный MCP-процесс запускать не нужно. Долгоживущий (long-polling) — запускать в фоне/tmux.
- `npm run http-server` → `node http-server.js` — **опциональный** Express-сервер (порт `PORT`, по умолчанию 3000). Полезен только эндпоинт `GET /health`; `POST /mcp` — это mock-транспорт (`MockStreamableHTTPServerTransport`) и вернёт "Внутренняя ошибка сервера" (это не баг окружения). Запускается в demo-режиме без токена: `DEMO_MODE=true npm run http-server`.

### Неочевидные моменты

- **Сборки нет.** Файлы (`*.js`) — уже транспилированный вывод; комментарии про `npm run build` и папку `dist/` в `http-server.js`/`mcp.js` устаревшие. Запуск идёт напрямую через `node`, шага build не существует.
- **Тестов, линтера и CI в репозитории нет.**
- **Токен MCP-сервера:** `mcp.js` берёт `--accessToken` из аргументов командной строки (или использует захардкоженный fallback-токен), а **не** из переменных окружения. Переменные окружения (`SINGULARITY_ACCESS_TOKEN`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS` и т.д.) читает конфиг бота `bot/config.js` (через `dotenv`). Для прямого запуска MCP как клиент передавайте токен так: `node mcp.js --accessToken "$SINGULARITY_ACCESS_TOKEN" -n`.
- **Секреты** для полной функциональности задаются через переменные окружения (в Cloud — раздел Secrets): `TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS` (иначе бот отказывает всем), `OPENAI_API_KEY`, `SINGULARITY_ACCESS_TOKEN`. Локальная конфигурация — копия `.env.example` → `.env` (`.env` в `.gitignore`).
- Реальные операции требуют доступа в интернет к внешним API: `api.singularity-app.com`, `api.openai.com`, `api.telegram.org`.
