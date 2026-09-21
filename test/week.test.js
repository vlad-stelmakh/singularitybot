"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getLastWeekBounds,
  formatWeekRange,
  formatDateList,
  joinRu,
  selectClosedWeekTasks,
  groupClosedTasks,
  parseProjectList,
  formatWeekMessage,
  findProjectListTool,
  buildWeekListTasksArgs,
  fetchWeekMessage,
} = require("../bot/week");
const { findTaskListTool } = require("../bot/today");

const WEEK_TOOL = {
  name: "listTasks",
  inputSchema: {
    type: "object",
    properties: {
      startDateFrom: { type: "string" },
      startDateTo: { type: "string" },
      includeArchived: { type: "boolean" },
      includeRemoved: { type: "boolean" },
      includeAllRecurrenceInstances: { type: "boolean" },
      maxCount: { type: "number" },
    },
  },
};

const PROJECT_TOOL = {
  name: "listProjects",
  inputSchema: {
    type: "object",
    properties: {
      includeArchived: { type: "boolean" },
      maxCount: { type: "number" },
    },
  },
};

test("прошлая неделя — пн–вс в поясе владельца", () => {
  // Понедельник 21 сентября 2026, 08:00 MSK
  const bounds = getLastWeekBounds(new Date("2026-09-21T05:00:00.000Z"), "+03:00");
  assert.equal(bounds.startDate, "2026-09-14");
  assert.equal(bounds.endDate, "2026-09-20");
  assert.equal(bounds.startIso, "2026-09-13T21:00:00.000Z");
  assert.equal(bounds.endIso, "2026-09-20T21:00:00.000Z");
  assert.equal(formatWeekRange(bounds), "14–20 сентября");
});

test("в воскресенье ещё считается текущая неделя, прошлый период — предыдущие пн–вс", () => {
  const bounds = getLastWeekBounds(new Date("2026-09-20T18:00:00.000Z"), "+03:00");
  assert.equal(bounds.startDate, "2026-09-07");
  assert.equal(bounds.endDate, "2026-09-13");
});

test("неделя на стыке месяцев и годов", () => {
  const january = getLastWeekBounds(new Date("2026-01-05T10:00:00.000Z"), "+03:00");
  assert.equal(january.startDate, "2025-12-29");
  assert.equal(january.endDate, "2026-01-04");
  assert.equal(formatWeekRange(january), "29 декабря 2025 – 4 января 2026");
});

test("склеивает даты по-русски", () => {
  assert.equal(joinRu([14]), "14");
  assert.equal(joinRu([14, 15]), "14 и 15");
  assert.equal(
    formatDateList(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]),
    "14, 15, 16, 17 и 18 сентября"
  );
  assert.equal(
    formatDateList(["2026-08-31", "2026-09-01", "2026-09-02"]),
    "31 августа, 1 сентября и 2 сентября"
  );
});

test("берёт закрытые задачи из архива и по completeLast", () => {
  const bounds = getLastWeekBounds(new Date("2026-09-21T10:00:00.000Z"), "+03:00");
  const selected = selectClosedWeekTasks(
    [
      { title: "Заметка", isNote: true, start: "2026-09-16T10:00:00.000Z", checked: 1 },
      { title: "Ещё открыта", start: "2026-09-16T10:00:00.000Z", checked: 0 },
      { title: "Синк", start: "2026-09-15T10:00:00.000Z", checked: 1 },
      {
        title: "Инъекция",
        completeLast: "2026-09-18T12:00:00.000Z",
        start: "2026-08-01T10:00:00.000Z",
      },
      { title: "Эта неделя", start: "2026-09-21T10:00:00.000Z", complete: 1 },
    ],
    bounds
  );
  assert.deepEqual(
    selected.map((task) => task.title),
    ["Синк", "Инъекция"]
  );
});

test("сворачивает повторяющиеся задачи и группирует по проекту", () => {
  const bounds = getLastWeekBounds(new Date("2026-09-21T10:00:00.000Z"), "+03:00");
  const tasks = [
    { title: "Синк", projectId: "work", start: "2026-09-14T10:00:00.000Z", checked: 1 },
    { title: "Синк", projectId: "work", start: "2026-09-15T10:00:00.000Z", checked: 1 },
    { title: "Синк", projectId: "work", start: "2026-09-16T10:00:00.000Z", checked: 1 },
    { title: "Ретро", projectId: "work", start: "2026-09-17T10:00:00.000Z", checked: 1 },
    {
      title: "Collagen Powder — принять",
      projectId: "health",
      start: "2026-09-14T07:00:00.000Z",
      checked: 1,
    },
    {
      title: "Collagen Powder — принять",
      projectId: "health",
      start: "2026-09-15T07:00:00.000Z",
      checked: 1,
    },
  ];
  const groups = groupClosedTasks(tasks, bounds);
  assert.equal(groups.length, 3);
  const sync = groups.find((group) => group.title === "Синк");
  assert.deepEqual(sync.dates, ["2026-09-14", "2026-09-15", "2026-09-16"]);

  const text = formatWeekMessage(tasks, bounds, [
    { id: "work", title: "Работа" },
    { id: "health", title: "Личное и здоровье" },
  ]);
  assert.match(text, /Что я сделал на прошлой неделе/);
  assert.match(text, /В архиве за 14–20 сентября отмечено/);
  assert.match(text, /\*\*Работа\*\*/);
  assert.match(text, /Синк — 14, 15 и 16 сентября/);
  assert.match(text, /Ретро\./);
  assert.match(text, /\*\*Личное и здоровье\*\*/);
  assert.match(text, /Collagen Powder — принять — 14 и 15 сентября/);
  assert.match(text, /Всего: 3/);
});

test("пустая неделя", () => {
  const bounds = getLastWeekBounds(new Date("2026-09-21T10:00:00.000Z"), "+03:00");
  assert.match(
    formatWeekMessage([], bounds),
    /За прошлую неделю \(14–20 сентября\) в архиве не отмечено выполненных задач/
  );
});

test("разбирает список проектов", () => {
  assert.deepEqual(
    parseProjectList(JSON.stringify({ projects: [{ id: "p1", title: "Работа" }] })).map(
      (project) => project.id
    ),
    ["p1"]
  );
  assert.equal(parseProjectList("[]").length, 0);
  assert.throws(() => parseProjectList("not-json"), /не JSON/);
});

test("собирает аргументы listTasks с архивом и экземплярами повторений", () => {
  const tool = findTaskListTool({ tools: [WEEK_TOOL] });
  const bounds = getLastWeekBounds(new Date("2026-09-21T10:00:00.000Z"), "+03:00");
  assert.deepEqual(buildWeekListTasksArgs(tool, bounds), {
    includeArchived: true,
    includeRemoved: false,
    maxCount: 1000,
    includeAllRecurrenceInstances: true,
    startDateFrom: bounds.startIso,
    startDateTo: bounds.endIso,
  });
  assert.deepEqual(buildWeekListTasksArgs(tool, bounds, { omitStartDates: true }), {
    includeArchived: true,
    includeRemoved: false,
    maxCount: 1000,
    includeAllRecurrenceInstances: true,
  });
});

test("находит инструмент списка проектов", () => {
  const tool = findProjectListTool({
    tools: [{ name: "createProject" }, PROJECT_TOOL],
  });
  assert.equal(tool.name, "listProjects");
  assert.equal(findProjectListTool({ tools: [] }), null);
});

test("fetchWeekMessage смотрит архив и при пустом ответе повторяет без дат", async () => {
  const bounds = getLastWeekBounds(new Date("2026-09-21T10:00:00.000Z"), "+03:00");
  const calls = [];
  const mcpClient = {
    tools: [WEEK_TOOL, PROJECT_TOOL],
    async callTool(name, args) {
      calls.push({ name, args });
      if (name === "listProjects") {
        return {
          isError: false,
          text: JSON.stringify({
            projects: [{ id: "work", title: "Работа" }],
          }),
        };
      }
      if (args.startDateFrom) {
        return { isError: false, text: JSON.stringify({ tasks: [] }) };
      }
      return {
        isError: false,
        text: JSON.stringify({
          tasks: [
            {
              title: "Backend code review",
              projectId: "work",
              completeLast: "2026-09-17T12:00:00.000Z",
              checked: 1,
            },
            {
              title: "Открытая",
              projectId: "work",
              start: "2026-09-16T10:00:00.000Z",
            },
          ],
        }),
      };
    },
  };

  const message = await fetchWeekMessage({
    mcpClient,
    timezone: "+03:00",
    now: new Date("2026-09-21T10:00:00.000Z"),
  });
  assert.equal(calls.filter((call) => call.name === "listTasks").length, 2);
  assert.equal(calls[0].args.includeArchived, true);
  assert.equal(calls[0].args.includeAllRecurrenceInstances, true);
  assert.equal(calls[0].args.startDateFrom, bounds.startIso);
  assert.equal(calls[1].args.startDateFrom, undefined);
  assert.match(message, /Backend code review/);
  assert.match(message, /\*\*Работа\*\*/);
  assert.doesNotMatch(message, /Открытая/);
});

test("fetchWeekMessage не делает второй запрос, если архив за неделю уже есть", async () => {
  let listCalls = 0;
  const mcpClient = {
    tools: [WEEK_TOOL],
    async callTool(name) {
      if (name === "listTasks") {
        listCalls += 1;
        return {
          isError: false,
          text: JSON.stringify({
            tasks: [
              {
                title: "Grooming",
                start: "2026-09-16T10:00:00.000Z",
                checked: 1,
              },
            ],
          }),
        };
      }
      throw new Error(`unexpected ${name}`);
    },
  };

  const message = await fetchWeekMessage({
    mcpClient,
    timezone: "+03:00",
    now: new Date("2026-09-21T10:00:00.000Z"),
  });
  assert.equal(listCalls, 1);
  assert.match(message, /Grooming/);
});
