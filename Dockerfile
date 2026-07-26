# Образ для постоянного запуска Telegram-бота (long-polling) на VPS.
# Сборки/транспиляции нет — файлы запускаются напрямую через node.
FROM node:22-alpine

# Утилиты для healthcheck и корректной обработки сигналов (PID 1).
RUN apk add --no-cache tini

ENV NODE_ENV=production

WORKDIR /app

# Сначала манифесты — чтобы слой с зависимостями кэшировался.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Остальной исходный код.
COPY . .

# Не запускаем процесс от root.
RUN chown -R node:node /app
USER node

# tini как init: пробрасывает сигналы и жнёт зомби-процессы
# (бот порождает mcp.js дочерним процессом по stdio).
ENTRYPOINT ["/sbin/tini", "--"]

# Долгоживущий процесс — Telegram-бот. Он сам запускает mcp.js.
CMD ["node", "bot/index.js"]
