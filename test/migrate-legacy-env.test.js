"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const dotenv = require("dotenv");
const { migrateEnvContent, migrateFile } = require("../scripts/migrate-legacy-env");

test("переносит общий legacy-токен для каждого Telegram ID", () => {
  const result = migrateEnvContent(
    "# Bot settings\nTELEGRAM_BOT_TOKEN=bot-token\nALLOWED_USER_IDS=123456, 789012\nSINGULARITY_ACCESS_TOKEN=shared-token\nOPENAI_API_KEY=openai-key\n"
  );

  const values = dotenv.parse(result);
  assert.equal(
    values.TELEGRAM_SINGULARITY_TOKENS,
    "123456:shared-token,789012:shared-token"
  );
  assert.equal(values.TELEGRAM_BOT_TOKEN, "bot-token");
  assert.equal(values.OPENAI_API_KEY, "openai-key");
  assert.equal(values.ALLOWED_USER_IDS, undefined);
  assert.equal(values.SINGULARITY_ACCESS_TOKEN, undefined);
});

test("отказывается перезаписывать уже мигрированную конфигурацию", () => {
  assert.throws(
    () =>
      migrateEnvContent(
        "TELEGRAM_SINGULARITY_TOKENS=123456:token\nALLOWED_USER_IDS=123456\nSINGULARITY_ACCESS_TOKEN=token\n"
      ),
    /уже задана/
  );
});

test("проверяет обязательные legacy-параметры и идентификаторы", () => {
  assert.throws(
    () => migrateEnvContent("SINGULARITY_ACCESS_TOKEN=token\n"),
    /ALLOWED_USER_IDS/
  );
  assert.throws(
    () => migrateEnvContent("ALLOWED_USER_IDS=abc\nSINGULARITY_ACCESS_TOKEN=token\n"),
    /Некорректный Telegram ID/
  );
  assert.throws(
    () => migrateEnvContent("ALLOWED_USER_IDS=123456\n"),
    /SINGULARITY_ACCESS_TOKEN/
  );
});

test("объясняет, что исходный .env нужно читать на хосте", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-env-"));
  const missing = path.join(dir, ".env");
  const dest = path.join(dir, ".env.migrated");
  assert.throws(
    () => migrateFile(missing, dest),
    /не через docker exec/
  );
});
