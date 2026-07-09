"use strict";

/**
 * Конфигурация Telegram-агента для SingularityApp.
 * Все значения читаются из переменных окружения (см. .env.example).
 */

require("dotenv").config();

const path = require("path");

function parseUserIds(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => String(s));
}

function required(name, value) {
  if (!value) {
    throw new Error(
      `Не задана обязательная переменная окружения ${name}. Проверьте файл .env (см. .env.example).`
    );
  }
  return value;
}

const config = {
  // Telegram
  telegramBotToken: required("TELEGRAM_BOT_TOKEN", process.env.TELEGRAM_BOT_TOKEN),

  // Список ID пользователей, которым разрешён доступ (владелец).
  // Пустой список означает "запрещено всем" — доступ нужно явно разрешить.
  allowedUserIds: parseUserIds(process.env.ALLOWED_USER_IDS),

  // OpenAI
  openaiApiKey: required("OPENAI_API_KEY", process.env.OPENAI_API_KEY),
  openaiBaseUrl: process.env.OPENAI_BASE_URL || undefined,
  // Модель для диалога и вызова инструментов (function calling + vision)
  chatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o",
  // Модель для расшифровки голосовых сообщений
  transcriptionModel:
    process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1",

  // Singularity API / MCP
  singularityBaseUrl:
    process.env.SINGULARITY_BASE_URL || "https://api.singularity-app.com",
  singularityAccessToken:
    process.env.SINGULARITY_ACCESS_TOKEN ||
    "910d5012-6c09-4190-85c3-692caf92575f",
  // Путь до запускаемого MCP-сервера (по умолчанию mcp.js в корне репозитория)
  mcpEntryPoint:
    process.env.MCP_ENTRY_POINT || path.join(__dirname, "..", "mcp.js"),

  // Часовой пояс владельца (используется агентом при расстановке дат/времени задач)
  ownerTimezone: process.env.OWNER_TIMEZONE || "+04:00",

  // Максимальное число итераций цикла вызова инструментов за один запрос
  maxToolIterations: Number(process.env.MAX_TOOL_ITERATIONS || 12),
  // Сколько последних сообщений диалога хранить в памяти на чат
  maxHistoryMessages: Number(process.env.MAX_HISTORY_MESSAGES || 40),
};

module.exports = { config, parseUserIds };
