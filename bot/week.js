"use strict";

/**
 * Команда /week: закрытые задачи SingularityApp за прошлую календарную
 * неделю (пн–вс в часовом поясе владельца). Смотрит архив и все
 * экземпляры повторяющихся задач — иначе ежедневки «пропадают».
 */

const {
  MONTHS_GENITIVE,
  parseUtcOffsetMinutes,
  calendarDate,
  parseTaskList,
  isCompleted,
  isNote,
  findTaskListTool,
} = require("./today");

const PROJECT_LIST_TOOL_CANDIDATES = [
  "listProjects",
  "list_projects",
  "projects_list",
  "get_projects",
  "getProjects",
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function ymd(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function parseYmd(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

function ownerMidnightUtcMs(now, offsetMinutes) {
  const shifted = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  return (
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
      0,
      0,
      0,
      0
    ) - offsetMinutes * 60 * 1000
  );
}

function partsFromUtcMs(utcMs, offsetMinutes) {
  const shifted = new Date(utcMs + offsetMinutes * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

/**
 * Прошлая календарная неделя пн–вс в поясе владельца.
 * Конец (endIso) — понедельник текущей недели, исключительно.
 */
function getLastWeekBounds(now = new Date(), offset = "+03:00") {
  const offsetMinutes = parseUtcOffsetMinutes(offset);
  const todayStartUtcMs = ownerMidnightUtcMs(now, offsetMinutes);
  const shifted = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
  const thisMondayUtcMs = todayStartUtcMs - daysSinceMonday * MS_PER_DAY;
  const lastMondayUtcMs = thisMondayUtcMs - 7 * MS_PER_DAY;
  const start = partsFromUtcMs(lastMondayUtcMs, offsetMinutes);
  const end = partsFromUtcMs(thisMondayUtcMs - 1, offsetMinutes);
  return {
    start,
    end,
    startDate: ymd(start.year, start.month, start.day),
    endDate: ymd(end.year, end.month, end.day),
    startIso: new Date(lastMondayUtcMs).toISOString(),
    endIso: new Date(thisMondayUtcMs).toISOString(),
    offsetMinutes,
  };
}

function formatWeekRange(bounds) {
  const { start, end } = bounds;
  if (start.month === end.month && start.year === end.year) {
    return `${start.day}–${end.day} ${MONTHS_GENITIVE[start.month]}`;
  }
  if (start.year === end.year) {
    return `${start.day} ${MONTHS_GENITIVE[start.month]} – ${end.day} ${MONTHS_GENITIVE[end.month]}`;
  }
  return `${start.day} ${MONTHS_GENITIVE[start.month]} ${start.year} – ${end.day} ${MONTHS_GENITIVE[end.month]} ${end.year}`;
}

function joinRu(items) {
  if (!items.length) return "";
  if (items.length === 1) return String(items[0]);
  if (items.length === 2) return `${items[0]} и ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} и ${items[items.length - 1]}`;
}

function formatDateList(dateKeys) {
  const parsed = (dateKeys || [])
    .map(parseYmd)
    .filter(Boolean)
    .sort((a, b) => ymd(a.year, a.month, a.day).localeCompare(ymd(b.year, b.month, b.day)));
  if (!parsed.length) return "";
  const unique = [];
  const seen = new Set();
  for (const part of parsed) {
    const key = ymd(part.year, part.month, part.day);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }
  const sameMonth = unique.every(
    (part) => part.month === unique[0].month && part.year === unique[0].year
  );
  if (sameMonth) {
    return `${joinRu(unique.map((part) => part.day))} ${MONTHS_GENITIVE[unique[0].month]}`;
  }
  return joinRu(
    unique.map((part) => `${part.day} ${MONTHS_GENITIVE[part.month]}`)
  );
}

function isClosed(task) {
  return isCompleted(task) || Boolean(task.completeLast);
}

function taskActivityDate(task, offsetMinutes) {
  const fromComplete = calendarDate(task.completeLast, offsetMinutes);
  if (fromComplete) return fromComplete;
  return calendarDate(task.start, offsetMinutes);
}

function dateInWeek(dateKey, bounds) {
  return Boolean(dateKey) && dateKey >= bounds.startDate && dateKey <= bounds.endDate;
}

function selectClosedWeekTasks(tasks, bounds) {
  return (tasks || [])
    .filter((task) => task && !isNote(task))
    .filter(isClosed)
    .filter((task) => dateInWeek(taskActivityDate(task, bounds.offsetMinutes), bounds))
    .sort((a, b) => {
      const dateDelta = taskActivityDate(a, bounds.offsetMinutes).localeCompare(
        taskActivityDate(b, bounds.offsetMinutes)
      );
      if (dateDelta !== 0) return dateDelta;
      return String(a.title || "").localeCompare(String(b.title || ""), "ru");
    });
}

function normalizeTitle(title) {
  return String(title || "Без названия").trim() || "Без названия";
}

function groupClosedTasks(tasks, bounds) {
  const groups = new Map();
  for (const task of tasks || []) {
    const title = normalizeTitle(task.title);
    const projectId = task.projectId || "";
    const key = `${projectId}\n${title}`;
    if (!groups.has(key)) {
      groups.set(key, {
        title,
        projectId,
        dates: [],
        count: 0,
      });
    }
    const group = groups.get(key);
    group.count += 1;
    const dateKey = taskActivityDate(task, bounds.offsetMinutes);
    if (dateKey && !group.dates.includes(dateKey)) {
      group.dates.push(dateKey);
    }
  }
  for (const group of groups.values()) {
    group.dates.sort();
  }
  return [...groups.values()];
}

function parseProjectList(text) {
  if (!text || !String(text).trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`MCP вернул не JSON при запросе проектов: ${err.message}`);
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.projects)) return parsed.projects;
  if (parsed && Array.isArray(parsed.data)) return parsed.data;
  if (parsed && parsed.result && Array.isArray(parsed.result.projects)) {
    return parsed.result.projects;
  }
  return [];
}

function buildProjectTitleMap(projects) {
  const map = new Map();
  for (const project of projects || []) {
    if (!project || !project.id) continue;
    map.set(project.id, normalizeTitle(project.title));
  }
  return map;
}

function sectionTitle(projectId, projectTitles) {
  if (!projectId) return "Без проекта";
  return projectTitles.get(projectId) || "Без проекта";
}

function formatGroupLine(group) {
  if (group.dates.length > 1) {
    return `- ${group.title} — ${formatDateList(group.dates)}.`;
  }
  return `- ${group.title}.`;
}

function formatWeekMessage(tasks, bounds, projects = []) {
  const range = formatWeekRange(bounds);
  const heading = "Что я сделал на прошлой неделе";
  if (!tasks.length) {
    return [
      heading,
      "",
      `За прошлую неделю (${range}) в архиве не отмечено выполненных задач.`,
    ].join("\n");
  }

  const projectTitles = buildProjectTitleMap(projects);
  const groups = groupClosedTasks(tasks, bounds);
  const sections = new Map();
  const sectionOrder = [];
  for (const group of groups) {
    const name = sectionTitle(group.projectId, projectTitles);
    if (!sections.has(name)) {
      sections.set(name, []);
      sectionOrder.push(name);
    }
    sections.get(name).push(group);
  }

  const lines = [
    heading,
    "",
    `В архиве за ${range} отмечено:`,
  ];

  for (const name of sectionOrder) {
    lines.push("", `**${name}**`);
    for (const group of sections.get(name)) {
      lines.push(formatGroupLine(group));
    }
  }

  lines.push("", `Всего: ${groups.length}`);
  return lines.join("\n");
}

function findProjectListTool(mcpClient) {
  const tools = (mcpClient && mcpClient.tools) || [];
  const names = tools.map((tool) => tool.name);
  for (const candidate of PROJECT_LIST_TOOL_CANDIDATES) {
    if (names.includes(candidate)) {
      return tools.find((tool) => tool.name === candidate);
    }
  }
  const fuzzy = tools.find(
    (tool) =>
      /list.*project/i.test(tool.name || "") ||
      /project.*list/i.test(tool.name || "")
  );
  if (fuzzy) return fuzzy;
  return null;
}

function buildWeekListTasksArgs(tool, bounds, { omitStartDates = false } = {}) {
  const properties =
    (tool && tool.inputSchema && tool.inputSchema.properties) || {};
  const args = {};
  if (properties.includeArchived) args.includeArchived = true;
  if (properties.includeRemoved) args.includeRemoved = false;
  if (properties.maxCount) args.maxCount = 1000;
  if (properties.includeAllRecurrenceInstances) {
    args.includeAllRecurrenceInstances = true;
  }
  if (!omitStartDates) {
    if (properties.startDateFrom) args.startDateFrom = bounds.startIso;
    if (properties.startDateTo) args.startDateTo = bounds.endIso;
    if (properties["start.gte"]) args["start.gte"] = bounds.startIso;
    if (properties["start.lt"]) args["start.lt"] = bounds.endIso;
  }
  return args;
}

function buildListProjectsArgs(tool) {
  const properties =
    (tool && tool.inputSchema && tool.inputSchema.properties) || {};
  const args = {};
  if (properties.includeArchived) args.includeArchived = true;
  if (properties.includeRemoved) args.includeRemoved = false;
  if (properties.maxCount) args.maxCount = 1000;
  return args;
}

async function fetchTaskList(mcpClient, tool, args) {
  const result = await mcpClient.callTool(tool.name, args);
  if (result.isError) {
    throw new Error(result.text || "Не удалось получить список задач.");
  }
  return parseTaskList(result.text);
}

async function fetchProjects(mcpClient) {
  const tool = findProjectListTool(mcpClient);
  if (!tool) return [];
  const result = await mcpClient.callTool(tool.name, buildListProjectsArgs(tool));
  if (result.isError) return [];
  try {
    return parseProjectList(result.text);
  } catch (err) {
    console.warn(`[week] не удалось разобрать проекты: ${err.message}`);
    return [];
  }
}

async function fetchWeekMessage({ mcpClient, timezone, now = new Date() }) {
  const bounds = getLastWeekBounds(now, timezone);
  const tool = findTaskListTool(mcpClient);
  let tasks = await fetchTaskList(
    mcpClient,
    tool,
    buildWeekListTasksArgs(tool, bounds)
  );
  let selected = selectClosedWeekTasks(tasks, bounds);

  // Если по start-диапазону пусто, архивные/повторяющиеся могли отфильтроваться.
  // Повторяем без дат и оставляем только закрытые за неделю.
  if (!selected.length) {
    tasks = await fetchTaskList(
      mcpClient,
      tool,
      buildWeekListTasksArgs(tool, bounds, { omitStartDates: true })
    );
    selected = selectClosedWeekTasks(tasks, bounds);
  }

  const projects = await fetchProjects(mcpClient);
  return formatWeekMessage(selected, bounds, projects);
}

module.exports = {
  PROJECT_LIST_TOOL_CANDIDATES,
  getLastWeekBounds,
  formatWeekRange,
  formatDateList,
  joinRu,
  isClosed,
  taskActivityDate,
  selectClosedWeekTasks,
  groupClosedTasks,
  parseProjectList,
  formatWeekMessage,
  findProjectListTool,
  buildWeekListTasksArgs,
  buildListProjectsArgs,
  fetchWeekMessage,
};
