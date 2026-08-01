"use strict";

const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const LEGACY_KEYS = new Set([
  "ALLOWED_USER_IDS",
  "SINGULARITY_ACCESS_TOKEN",
]);

function parseUserIds(raw) {
  if (!raw || !raw.trim()) {
    throw new Error("Не задана ALLOWED_USER_IDS.");
  }

  const userIds = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (userIds.length === 0) {
    throw new Error("Не задана ALLOWED_USER_IDS.");
  }

  const uniqueUserIds = new Set();
  for (const userId of userIds) {
    if (!/^\d+$/.test(userId) || Number(userId) <= 0) {
      throw new Error(`Некорректный Telegram ID "${userId}" в ALLOWED_USER_IDS.`);
    }
    if (uniqueUserIds.has(userId)) {
      throw new Error(`Telegram ID ${userId} указан в ALLOWED_USER_IDS более одного раза.`);
    }
    uniqueUserIds.add(userId);
  }

  return userIds;
}

function removeLegacyDeclarations(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      return !match || !LEGACY_KEYS.has(match[1]);
    })
    .join("\n")
    .replace(/\n+$/, "");
}

function migrateEnvContent(content) {
  const values = dotenv.parse(content);
  if (values.TELEGRAM_SINGULARITY_TOKENS?.trim()) {
    throw new Error(
      "TELEGRAM_SINGULARITY_TOKENS уже задана. Миграция не требуется."
    );
  }

  const userIds = parseUserIds(values.ALLOWED_USER_IDS);
  const accessToken = values.SINGULARITY_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    throw new Error("Не задана SINGULARITY_ACCESS_TOKEN.");
  }
  if (accessToken.includes(",")) {
    throw new Error(
      "SINGULARITY_ACCESS_TOKEN содержит запятую и не может быть автоматически преобразован."
    );
  }

  const tokenMap = userIds.map((userId) => `${userId}:${accessToken}`).join(",");
  const retainedContent = removeLegacyDeclarations(content);
  const separator = retainedContent ? "\n\n" : "";
  return `${retainedContent}${separator}# Мигрировано из ALLOWED_USER_IDS и SINGULARITY_ACCESS_TOKEN\nTELEGRAM_SINGULARITY_TOKENS=${JSON.stringify(tokenMap)}\n`;
}

function migrateFile(sourcePath, destinationPath) {
  if (path.resolve(sourcePath) === path.resolve(destinationPath)) {
    throw new Error("Файл назначения должен отличаться от исходного.");
  }
  if (fs.existsSync(destinationPath)) {
    throw new Error(`Файл назначения уже существует: ${destinationPath}`);
  }

  const migratedContent = migrateEnvContent(fs.readFileSync(sourcePath, "utf8"));
  fs.writeFileSync(destinationPath, migratedContent, "utf8");
}

if (require.main === module) {
  const [sourcePath = ".env", destinationPath = ".env.migrated"] =
    process.argv.slice(2);
  try {
    migrateFile(sourcePath, destinationPath);
    console.log(`Создан файл с новой конфигурацией: ${destinationPath}`);
  } catch (error) {
    console.error(`Миграция не выполнена: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { migrateEnvContent, migrateFile, parseUserIds };
