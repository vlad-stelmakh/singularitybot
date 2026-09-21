"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildSystemPrompt } = require("../bot/prompt");

const now = new Date("2026-08-12T12:00:00.000Z");

test("без Jira не упоминает рабочие тикеты", () => {
  const prompt = buildSystemPrompt({ timezone: "+03:00", now });
  assert.doesNotMatch(prompt, /Jira \(рабочие задачи\)/);
  assert.doesNotMatch(prompt, /jira_my_sprint/);
  assert.match(prompt, /includeArchived: true/);
  assert.match(prompt, /includeAllRecurrenceInstances: true/);
});

test("с Jira добавляет правила обзора спринта", () => {
  const prompt = buildSystemPrompt({
    timezone: "+03:00",
    now,
    jira: { enabled: true, projectKey: "PROJ", boardId: "15" },
  });
  assert.match(prompt, /Также можешь смотреть рабочие задачи в Jira/);
  assert.match(prompt, /jira_my_sprint/);
  assert.match(prompt, /Ключ проекта по умолчанию: PROJ/);
  assert.match(prompt, /ID доски по умолчанию: 15/);
  assert.match(prompt, /только читают данные/);
});
