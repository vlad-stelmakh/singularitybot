"use strict";

/**
 * Конфигурация Telegram-агента для SingularityApp.
 * Все значения читаются из переменных окружения (см. .env.example).
 */

require("dotenv").config();

const path = require("path");
const {
  parseTelegramSingularityTokens,
  createLegacyProfiles,
} = require("./user-map");

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

const allowedUserIds = parseUserIds(process.env.ALLOWED_USER_IDS);
const legacyAccessToken = process.env.SINGULARITY_ACCESS_TOKEN;
const userProfiles = parseTelegramSingularityTokens(
  process.env.TELEGRAM_SINGULARITY_TOKENS
);
const effectiveUserProfiles =
  userProfiles.size > 0
    ? userProfiles
    : createLegacyProfiles(allowedUserIds, legacyAccessToken);

if (userProfiles.size > 0 && allowedUserIds.length > 0) {
  console.warn(
    "[warn] TELEGRAM_SINGULARITY_TOKENS задана: ALLOWED_USER_IDS и SINGULARITY_ACCESS_TOKEN игнорируются."
  );
}

const config = {
  // Telegram
  telegramBotToken: required("TELEGRAM_BOT_TOKEN", process.env.TELEGRAM_BOT_TOKEN),

  // Telegram ID -> ключ Singularity API. Ключи этого объекта одновременно
  // служат явным списком пользователей, которым разрешён доступ.
  userProfiles: effectiveUserProfiles,

  // OpenAI
  openaiApiKey: required("OPENAI_API_KEY", process.env.OPENAI_API_KEY),
  openaiBaseUrl: process.env.OPENAI_BASE_URL || undefined,
  // Модель для диалога и вызова инструментов (function calling + vision)
  chatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o",
  // reasoning_effort для reasoning-моделей (gpt-5.x и т.п.).
  // Пусто = авто: для gpt-5.x подставляется "none", иначе параметр не отправляется.
  // Важно: в /v1/chat/completions нельзя сочетать function tools с reasoning_effort != "none".
  reasoningEffort: process.env.OPENAI_REASONING_EFFORT || undefined,
  // Модель для расшифровки голосовых сообщений
  transcriptionModel:
    process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1",

  // Singularity API / MCP
  singularityBaseUrl:
    process.env.SINGULARITY_BASE_URL || "https://api.singularity-app.com",
  // Путь до запускаемого MCP-сервера (по умолчанию mcp.js в корне репозитория)
  mcpEntryPoint:
    process.env.MCP_ENTRY_POINT || path.join(__dirname, "..", "mcp.js"),

  // Часовой пояс владельца (используется агентом при расстановке дат/времени задач)
  ownerTimezone: process.env.OWNER_TIMEZONE || "+03:00",

  // Максимальное число итераций цикла вызова инструментов за один запрос
  maxToolIterations: Number(process.env.MAX_TOOL_ITERATIONS || 12),
  // Сколько последних сообщений диалога хранить в памяти на чат
  maxHistoryMessages: Number(process.env.MAX_HISTORY_MESSAGES || 40),
};

module.exports = { config, parseUserIds };
