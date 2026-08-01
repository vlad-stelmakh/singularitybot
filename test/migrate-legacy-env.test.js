"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const dotenv = require("dotenv");
const { migrateEnvContent } = require("../scripts/migrate-legacy-env");

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
