"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseUtcOffsetMinutes,
  getDayBounds,
  calendarDate,
  formatClock,
  parseTaskList,
  selectTodayTasks,
  formatTodayMessage,
  findTaskListTool,
  buildListTasksArgs,
  fetchTodayMessage,
} = require("../bot/today");

test("разбирает смещение часового пояса", () => {
  assert.equal(parseUtcOffsetMinutes("+03:00"), 180);
  assert.equal(parseUtcOffsetMinutes("-05:00"), -300);
  assert.equal(parseUtcOffsetMinutes("Z"), 0);
  assert.throws(() => parseUtcOffsetMinutes("Europe/Moscow"), /Некорректный часовой пояс/);
});

test("границы дня считаются в поясе владельца", () => {
  const now = new Date("2026-09-16T01:30:00.000Z");
  const bounds = getDayBounds(now, "+03:00");
  assert.equal(bounds.date, "2026-09-16");
  assert.equal(bounds.startIso, "2026-09-15T21:00:00.000Z");
  assert.equal(bounds.endIso, "2026-09-16T21:00:00.000Z");
  assert.equal(calendarDate("2026-09-16T11:00:00+04:00", bounds.offsetMinutes), "2026-09-16");
  assert.equal(formatClock("2026-09-16T08:30:00.000Z", bounds.offsetMinutes), "11:30");
});

test("до полуночи UTC это ещё предыдущий день в +03", () => {
  const bounds = getDayBounds(new Date("2026-09-15T22:00:00.000Z"), "+03:00");
  assert.equal(bounds.date, "2026-09-16");
});

test("разбирает список задач из ответа MCP", () => {
  assert.deepEqual(
    parseTaskList(JSON.stringify({ tasks: [{ id: "T-1", title: "A" }] })).map((t) => t.id),
    ["T-1"]
  );
  assert.equal(parseTaskList("[]").length, 0);
  assert.throws(() => parseTaskList("not-json"), /не JSON/);
});

test("отбирает задачи на календарный день и прячет заметки", () => {
  const bounds = getDayBounds(new Date("2026-09-16T10:00:00.000Z"), "+03:00");
  const selected = selectTodayTasks(
    [
      { title: "Заметка", isNote: true, start: "2026-09-16T10:00:00.000Z" },
      { title: "Завтра", start: "2026-09-17T10:00:00.000Z" },
      { title: "Готово", start: "2026-09-16T07:00:00.000Z", checked: 1 },
      { title: "Позже", start: "2026-09-16T12:00:00.000Z" },
      { title: "Рано", start: "2026-09-16T06:00:00.000Z" },
    ],
    bounds
  );
  assert.deepEqual(
    selected.map((task) => task.title),
    ["Рано", "Позже", "Готово"]
  );
});

test("форматирует пустой и непустой список", () => {
  const bounds = getDayBounds(new Date("2026-09-16T10:00:00.000Z"), "+03:00");
  assert.match(
    formatTodayMessage([], bounds),
    /На сегодня в SingularityApp нет задач/
  );
  const text = formatTodayMessage(
    [
      { title: "Daily", start: "2026-09-16T08:30:00.000Z" },
      { title: "Готово", start: "2026-09-16T07:00:00.000Z", complete: 1 },
    ],
    bounds
  );
  assert.match(text, /16 сентября 2026/);
  assert.match(text, /11:30 — Daily/);
  assert.match(text, /Готово \(1\)/);
  assert.match(text, /10:00 — Готово/);
  assert.match(text, /Всего: 2/);
});

test("находит инструмент списка задач и собирает аргументы", () => {
  const tool = findTaskListTool({
    tools: [
      {
        name: "listTasks",
        inputSchema: {
          type: "object",
          properties: {
            startDateFrom: { type: "string" },
            startDateTo: { type: "string" },
            includeArchived: { type: "boolean" },
            maxCount: { type: "number" },
          },
        },
      },
    ],
  });
  assert.equal(tool.name, "listTasks");
  const bounds = getDayBounds(new Date("2026-09-16T10:00:00.000Z"), "+03:00");
  assert.deepEqual(buildListTasksArgs(tool, bounds), {
    includeArchived: false,
    maxCount: 1000,
    startDateFrom: bounds.startIso,
    startDateTo: bounds.endIso,
  });
});

test("fetchTodayMessage вызывает MCP и собирает текст", async () => {
  const bounds = getDayBounds(new Date("2026-09-16T10:00:00.000Z"), "+03:00");
  const mcpClient = {
    tools: [
      {
        name: "listTasks",
        inputSchema: {
          properties: {
            startDateFrom: {},
            startDateTo: {},
          },
        },
      },
    ],
    async callTool(name, args) {
      assert.equal(name, "listTasks");
      assert.equal(args.startDateFrom, bounds.startIso);
      return {
        isError: false,
        text: JSON.stringify({
          tasks: [
            { title: "Daily", start: "2026-09-16T08:30:00.000Z", isNote: false },
          ],
        }),
      };
    },
  };

  const message = await fetchTodayMessage({
    mcpClient,
    timezone: "+03:00",
    now: new Date("2026-09-16T10:00:00.000Z"),
  });
  assert.match(message, /Daily/);
  assert.match(message, /11:30/);
});
