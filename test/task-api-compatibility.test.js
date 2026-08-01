"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeTaskSchedule } = require("../client");
const { error } = require("../utils/response");
const { assertRecurrenceIsNotSupported } = require("../modules/task");

test("преобразует date-only start для задачи без времени", () => {
  assert.deepEqual(
    normalizeTaskSchedule({ title: "Инъекция", start: "2026-08-13", useTime: false }),
    {
      title: "Инъекция",
      start: "2026-08-13T00:00:00.000Z",
      useTime: false,
    }
  );
});

test("не меняет задачи со временем и датами со смещением", () => {
  const timedTask = {
    title: "Лекарство",
    start: "2026-08-01T18:00:00+04:00",
    useTime: true,
  };
  assert.equal(normalizeTaskSchedule(timedTask), timedTask);
});

test("возвращает сообщение API вместо общего текста Axios", () => {
  const axiosError = new Error("Request failed with status code 400");
  axiosError.response = {
    data: {
      statusCode: 400,
      message: ["property recurrence should not exist"],
      error: "Bad Request",
    },
  };

  assert.equal(
    error(axiosError).content[0].text,
    "property recurrence should not exist"
  );
});

test("отклоняет recurrence до запроса к API", () => {
  assert.throws(
    () => assertRecurrenceIsNotSupported({ recurrence: { type: "daily" } }),
    /Повторяющиеся задачи/
  );
  assert.doesNotThrow(() => assertRecurrenceIsNotSupported({ title: "Задача" }));
});
