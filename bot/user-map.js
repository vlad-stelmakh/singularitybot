"use strict";

/**
 * Разбирает соответствие Telegram ID и ключей Singularity API.
 *
 * Формат: "telegramId:apiKey,telegramId:apiKey".
 * API-ключ может содержать двоеточия: разделителем считается только первое.
 *
 * @param {string|undefined} raw
 * @returns {Map<string, {accessToken: string}>}
 */
function parseTelegramSingularityTokens(raw) {
  const profiles = new Map();
  if (!raw || !raw.trim()) return profiles;

  for (const entry of raw.split(",")) {
    const pair = entry.trim();
    const separator = pair.indexOf(":");
    if (separator === -1) {
      throw new Error(
        "Неверный формат TELEGRAM_SINGULARITY_TOKENS. Используйте telegramId:apiKey,telegramId:apiKey."
      );
    }

    const userId = pair.slice(0, separator).trim();
    const accessToken = pair.slice(separator + 1).trim();
    if (!/^\d+$/.test(userId) || Number(userId) <= 0) {
      throw new Error(
        `Некорректный Telegram ID "${userId}" в TELEGRAM_SINGULARITY_TOKENS.`
      );
    }
    if (!accessToken) {
      throw new Error(
        `Не задан ключ Singularity API для Telegram ID ${userId}.`
      );
    }
    if (profiles.has(userId)) {
      throw new Error(
        `Telegram ID ${userId} указан в TELEGRAM_SINGULARITY_TOKENS более одного раза.`
      );
    }

    profiles.set(userId, { accessToken });
  }

  return profiles;
}

function createLegacyProfiles(userIds, accessToken) {
  if (userIds.length === 0 || !accessToken) return new Map();
  return new Map(userIds.map((userId) => [userId, { accessToken }]));
}

module.exports = { parseTelegramSingularityTokens, createLegacyProfiles };
