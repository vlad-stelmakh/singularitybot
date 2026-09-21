"use strict";

/**
 * Команда /today: задачи SingularityApp, запланированные на текущий день
 * в часовом поясе владельца.
 */

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const TASK_LIST_TOOL_CANDIDATES = [
  "listTasks",
  "list_tasks",
  "tasks_list",
  "get_tasks",
  "getTasks",
  "list_today_tasks",
];

function parseUtcOffsetMinutes(offset) {
  const raw = String(offset || "+03:00").trim();
  if (raw === "Z" || raw.toUpperCase() === "UTC") return 0;
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(raw);
  if (!match) {
    throw new Error(`Некорректный часовой пояс "${offset}". Ожидается смещение вида +03:00.`);
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === "-" ? -1 : 1) * minutes;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getDayBounds(now = new Date(), offset = "+03:00") {
  const offsetMinutes = parseUtcOffsetMinutes(offset);
  const shifted = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const startUtcMs = Date.UTC(year, month, day, 0, 0, 0, 0) - offsetMinutes * 60 * 1000;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;
  return {
    date: `${year}-${pad2(month + 1)}-${pad2(day)}`,
    year,
    month,
    day,
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
    offsetMinutes,
  };
}

function calendarDate(iso, offsetMinutes) {
  if (!iso || typeof iso !== "string") return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso.slice(0, 10);
  }
  const shifted = new Date(parsed.getTime() + offsetMinutes * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(
    shifted.getUTCDate()
  )}`;
}

function formatClock(iso, offsetMinutes) {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const shifted = new Date(parsed.getTime() + offsetMinutes * 60 * 1000);
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}

function formatHumanDate(bounds) {
  return `${bounds.day} ${MONTHS_GENITIVE[bounds.month]} ${bounds.year}`;
}

function parseTaskList(text) {
  if (!text || !String(text).trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `MCP вернул не JSON при запросе задач: ${err.message}`
    );
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.tasks)) return parsed.tasks;
  if (parsed && Array.isArray(parsed.data)) return parsed.data;
  if (parsed && parsed.result && Array.isArray(parsed.result.tasks)) {
    return parsed.result.tasks;
  }
  return [];
}

function isCompleted(task) {
  return task.checked === 1 || task.complete === 1 || task.checked === true;
}

function isNote(task) {
  return task.isNote === true || task.isNote === 1;
}

function startMs(task) {
  const ms = Date.parse(task.start || "");
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

function selectTodayTasks(tasks, bounds) {
  return (tasks || [])
    .filter((task) => task && !isNote(task))
    .filter((task) => calendarDate(task.start, bounds.offsetMinutes) === bounds.date)
    .sort((a, b) => {
      const done = Number(isCompleted(a)) - Number(isCompleted(b));
      if (done !== 0) return done;
      const allDay = Number(a.useTime !== false) - Number(b.useTime !== false);
      if (allDay !== 0) return allDay;
      const delta = startMs(a) - startMs(b);
      if (delta !== 0) return delta;
      return String(a.title || "").localeCompare(String(b.title || ""), "ru");
    });
}

function formatTodayMessage(tasks, bounds) {
  const heading = `📅 Задачи на сегодня, ${formatHumanDate(bounds)}`;
  if (!tasks.length) {
    return `${heading}\n\nНа сегодня в SingularityApp нет задач.`;
  }

  const open = tasks.filter((task) => !isCompleted(task));
  const done = tasks.filter((task) => isCompleted(task));
  const lines = [heading, ""];

  const render = (task) => {
    const time = task.useTime === false ? "" : formatClock(task.start, bounds.offsetMinutes);
    const prefix = time ? `${time} — ` : "";
    return `• ${prefix}${task.title || "Без названия"}`;
  };

  if (open.length) {
    lines.push(...open.map(render));
  } else {
    lines.push("Открытых задач нет.");
  }

  if (done.length) {
    lines.push("", `Готово (${done.length}):`);
    lines.push(...done.map((task) => `• ~~${render(task).slice(2)}~~`));
  }

  lines.push("", `Всего: ${tasks.length}`);
  return lines.join("\n");
}

function findTaskListTool(mcpClient) {
  const tools = (mcpClient && mcpClient.tools) || [];
  const names = tools.map((tool) => tool.name);
  for (const candidate of TASK_LIST_TOOL_CANDIDATES) {
    if (names.includes(candidate)) {
      return tools.find((tool) => tool.name === candidate);
    }
  }
  const fuzzy = tools.find(
    (tool) =>
      /list.*task/i.test(tool.name || "") || /task.*list/i.test(tool.name || "")
  );
  if (fuzzy) return fuzzy;
  throw new Error("MCP не предоставляет инструмент списка задач.");
}

function buildListTasksArgs(tool, bounds) {
  const properties =
    (tool && tool.inputSchema && tool.inputSchema.properties) || {};
  const args = {};
  if (properties.includeArchived) args.includeArchived = false;
  if (properties.includeRemoved) args.includeRemoved = false;
  if (properties.maxCount) args.maxCount = 1000;
  if (properties.includeAllRecurrenceInstances) {
    args.includeAllRecurrenceInstances = false;
  }
  if (properties.startDateFrom) args.startDateFrom = bounds.startIso;
  if (properties.startDateTo) args.startDateTo = bounds.endIso;
  if (properties["start.gte"]) args["start.gte"] = bounds.startIso;
  if (properties["start.lt"]) args["start.lt"] = bounds.endIso;
  return args;
}

async function fetchTodayMessage({ mcpClient, timezone, now = new Date() }) {
  const bounds = getDayBounds(now, timezone);
  const tool = findTaskListTool(mcpClient);
  const result = await mcpClient.callTool(
    tool.name,
    buildListTasksArgs(tool, bounds)
  );
  if (result.isError) {
    throw new Error(result.text || "Не удалось получить список задач.");
  }
  const selected = selectTodayTasks(parseTaskList(result.text), bounds);
  return formatTodayMessage(selected, bounds);
}

module.exports = {
  MONTHS_GENITIVE,
  TASK_LIST_TOOL_CANDIDATES,
  parseUtcOffsetMinutes,
  getDayBounds,
  calendarDate,
  formatClock,
  formatHumanDate,
  parseTaskList,
  isCompleted,
  isNote,
  selectTodayTasks,
  formatTodayMessage,
  findTaskListTool,
  buildListTasksArgs,
  fetchTodayMessage,
};
