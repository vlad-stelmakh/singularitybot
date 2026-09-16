# Singularity MCP Server

## Цель проекта

Задачи не всегда удобно формулировать в виде строгой формы с десятком полей. Этот проект позволяет создавать и вести задачи в SingularityApp более свободно: написать обычным сообщением, надиктовать голосовое, прислать фотографию списка дел или скриншот. Бот распознаёт контекст, при необходимости задаёт уточняющие вопросы и выполняет операции через API SingularityApp.

Например, можно написать: «Напомни в пятницу обсудить макет с командой», отправить голосовое с планом на день или сфотографировать заметки после встречи.

## Что внутри

- Telegram-бот — основной интерфейс: принимает текст, голосовые сообщения, аудио и изображения. Команда `/today` показывает задачи на текущий день.
- OpenAI — расшифровывает голосовые сообщения, понимает изображения и ведёт диалог.
- Официальный MCP SingularityApp (`https://mcp.singularity-app.com/mcp`) — агент вызывает инструменты hosted MCP по Streamable HTTP. Если сервер отклоняет API-токен, бот откатится на встроенный `mcp.js`.
- MCP-сервер Jira — необязательный read-only доступ к рабочим задачам (спринт, JQL, карточка).
- HTTP-сервер — необязательный сервис с endpoint'ом проверки состояния.

## Требования

- Node.js 18 или новее
- npm
- токены Telegram, OpenAI и SingularityApp для полной работы

## Быстрый запуск Telegram-бота

1. Установите зависимости:

   ```bash
   npm ci
   ```

2. Создайте локальный файл конфигурации:

   ```bash
   cp .env.example .env
   ```

3. Заполните в `.env` как минимум:

   ```dotenv
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_SINGULARITY_TOKENS=123456789:singularity-api-key
   OPENAI_API_KEY=...
   ```

   `TELEGRAM_SINGULARITY_TOKENS` связывает Telegram ID с ключом Singularity API. Бот откажет в доступе всем пользователям, которых нет в этой переменной. Для нескольких пользователей используйте формат `telegramId:apiKey,telegramId:apiKey`.

   Чтобы бот ещё и смотрел рабочие задачи в Jira (что в спринте, на чём сфокусироваться), добавьте в `.env`:

   ```dotenv
   JIRA_BASE_URL=https://your-domain.atlassian.net
   JIRA_EMAIL=you@example.com
   JIRA_API_TOKEN=...
   ```

   API-токен создаётся в [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens). Без этих трёх переменных Jira просто не подключается — остальное работает как раньше. По желанию можно задать `JIRA_PROJECT_KEY` и `JIRA_BOARD_ID`, чтобы не искать проект и доску каждый раз.

   Если есть старая конфигурация с `ALLOWED_USER_IDS` и общим `SINGULARITY_ACCESS_TOKEN`, создайте мигрированный файл **на хосте** (не через `docker exec` — `.env` в контейнере нет):

   ```bash
   npm run migrate-legacy-env -- .env .env.migrated
   ```

   Проверьте `.env.migrated`, затем замените им `.env`. Если бот уже запущен в Docker, после замены пересоздайте контейнер: `docker compose up -d --force-recreate`.

4. Запустите бота:

   ```bash
   npm run bot
   ```

Бот самостоятельно подключается к официальному MCP SingularityApp (`https://mcp.singularity-app.com/mcp`). Отдельно запускать `mcp.js` для работы бота не нужно. Если официальный сервер отклонит API-токен (hosted MCP рассчитан на OAuth), бот откатится на встроенный `mcp.js` как дочерний процесс. Если заданы переменные Jira, бот так же поднимает `jira-mcp.js`.

Команды в чате:

| Команда | Назначение |
| --- | --- |
| `/today` | Список задач SingularityApp на сегодня (в `OWNER_TIMEZONE`) |
| `/reset` | Очистить контекст диалога |

## Скрипты npm

| Команда | Назначение |
| --- | --- |
| `npm run bot` | Запускает Telegram-бота. |
| `npm run mcp` | Запускает MCP-сервер Singularity по stdio для подключения из MCP-клиента. |
| `npm run jira-mcp` | Запускает read-only MCP-сервер Jira по stdio. |
| `npm run http-server` | Запускает необязательный HTTP-сервер. |
| `npm run migrate-legacy-env -- [исходный-файл] [новый-файл]` | Мигрирует `ALLOWED_USER_IDS` и `SINGULARITY_ACCESS_TOKEN` в `TELEGRAM_SINGULARITY_TOKENS`. По умолчанию использует `.env` и создаёт `.env.migrated`. |
| `npm test` | Запускает тесты. |

MCP-сервер предназначен для MCP-клиента, а не для ручного ввода в терминале. При прямом подключении передайте токен аргументом:

```bash
node mcp.js --accessToken "$SINGULARITY_ACCESS_TOKEN" -n
```

## Jira (необязательно)

Если в `.env` заданы `JIRA_BASE_URL`, `JIRA_EMAIL` и `JIRA_API_TOKEN`, бот подключает read-only MCP к Jira Cloud. Можно спросить, например:

- «Что у меня в текущем спринте?»
- «На чём важно сфокусироваться сегодня?»
- «Что с PROJ-123?»

Без этих переменных интеграция выключена, бот работает только с SingularityApp. Если Jira не подключится (неверный токен, нет сети), бот продолжит отвечать по Singularity и напишет предупреждение в лог.

Для прямого запуска Jira MCP из другого клиента:

```bash
node jira-mcp.js --baseUrl "$JIRA_BASE_URL" --email "$JIRA_EMAIL" --apiToken "$JIRA_API_TOKEN" -n
```

## HTTP-сервер

Для демонстрационного запуска без токена:

```bash
DEMO_MODE=true npm run http-server
```

После запуска endpoint `GET /health` доступен на порту `3000` или значении переменной `PORT`. Транспорт `POST /mcp` является mock-реализацией и не предназначен для рабочего MCP-подключения.

## Конфигурация

Все параметры перечислены в `.env.example`. В частности, можно настроить:

- модель для диалога и модель расшифровки;
- URL API SingularityApp, официального MCP и OpenAI;
- опциональный набор `toolsets` и откат на локальный `mcp.js`;
- опциональное подключение к Jira Cloud;
- часовой пояс владельца;
- максимальную длину истории диалога и число итераций инструментов.

Не добавляйте `.env` или реальные токены в репозиторий.
