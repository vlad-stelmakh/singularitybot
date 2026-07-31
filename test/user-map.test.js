"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseTelegramSingularityTokens,
  createLegacyProfiles,
} = require("../bot/user-map");

test("разбирает соответствия Telegram ID и ключей", () => {
  const profiles = parseTelegramSingularityTokens(
    "123456:token-one, 789012:token:with:colon"
  );

  assert.deepEqual([...profiles.entries()], [
    ["123456", { accessToken: "token-one" }],
    ["789012", { accessToken: "token:with:colon" }],
  ]);
});

test("отклоняет некорректные и дублирующиеся Telegram ID", () => {
  assert.throws(
    () => parseTelegramSingularityTokens("abc:token"),
    /Некорректный Telegram ID/
  );
  assert.throws(
    () => parseTelegramSingularityTokens("123456:one,123456:two"),
    /более одного раза/
  );
  assert.throws(
    () => parseTelegramSingularityTokens("123456:"),
    /Не задан ключ/
  );
});

test("создаёт legacy-профили с общим ключом", () => {
  assert.deepEqual(
    [...createLegacyProfiles(["123456", "789012"], "legacy-key").entries()],
    [
      ["123456", { accessToken: "legacy-key" }],
      ["789012", { accessToken: "legacy-key" }],
    ]
  );
  assert.equal(createLegacyProfiles([], "legacy-key").size, 0);
});
