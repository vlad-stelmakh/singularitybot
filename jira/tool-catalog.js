"use strict";

const { z } = require("zod");

/**
 * Общий каталог read-only инструментов Jira.
 * MCP-сервер регистрирует их через stdio, HTTP-клиент бота вызывает REST напрямую.
 */

const JIRA_TOOL_CATALOG = [
  {
    name: "jira_myself",
    title: "Jira: текущий пользователь",
    description:
      "Возвращает аккаунт Jira, от имени которого идут запросы (displayName, email, timezone). Вызови, если нужно понять, чей это спринт.",
    parameters: { type: "object", properties: {} },
    zodSchema: {},
    call: (jira) => jira.getMyself(),
  },
  {
    name: "jira_my_sprint",
    title: "Jira: мой текущий спринт",
    description:
      "Быстрый обзор активного спринта: задачи из openSprints(). По умолчанию только назначенные на текущего пользователя и без Done. Используй это первым, когда спрашивают «что в спринте», «на чём сфокусироваться», «какие рабочие задачи».",
    parameters: {
      type: "object",
      properties: {
        mineOnly: {
          type: "boolean",
          description: "true — только задачи текущего пользователя (по умолчанию true)",
        },
        includeDone: {
          type: "boolean",
          description: "true — включить уже закрытые задачи спринта (по умолчанию false)",
        },
        maxResults: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    zodSchema: {
      mineOnly: z
        .boolean()
        .optional()
        .describe("true — только задачи текущего пользователя (по умолчанию true)"),
      includeDone: z
        .boolean()
        .optional()
        .describe("true — включить уже закрытые задачи спринта (по умолчанию false)"),
      maxResults: z.number().int().min(1).max(100).optional(),
    },
    call: (jira, args) => jira.mySprint(args),
  },
  {
    name: "jira_search",
    title: "Jira: поиск по JQL",
    description:
      "Ищет задачи по JQL. Примеры: 'assignee = currentUser() AND statusCategory != Done', 'sprint in openSprints()', 'key = PROJ-123'. Не выдумывай ключи проектов — уточни или возьми из jira_list_boards / jira_my_sprint.",
    parameters: {
      type: "object",
      properties: {
        jql: { type: "string", description: "JQL-запрос" },
        maxResults: { type: "integer", minimum: 1, maximum: 100 },
        nextPageToken: {
          type: "string",
          description: "Токен следующей страницы из предыдущего ответа",
        },
      },
      required: ["jql"],
    },
    zodSchema: {
      jql: z.string().describe("JQL-запрос"),
      maxResults: z.number().int().min(1).max(100).optional(),
      nextPageToken: z
        .string()
        .optional()
        .describe("Токен следующей страницы из предыдущего ответа"),
    },
    call: (jira, args) => jira.search(args),
  },
  {
    name: "jira_get_issue",
    title: "Jira: детали задачи",
    description:
      "Карточка задачи по ключу (PROJ-123): описание, статус, приоритет, спринт, суброадмап, связи и последние комментарии.",
    parameters: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "Ключ задачи, например PROJ-123" },
      },
      required: ["issueKey"],
    },
    zodSchema: {
      issueKey: z.string().describe("Ключ задачи, например PROJ-123"),
    },
    call: (jira, args) => jira.getIssue(args.issueKey),
  },
  {
    name: "jira_list_boards",
    title: "Jira: список досок",
    description:
      "Список Scrum/Kanban досок. Нужен, чтобы узнать boardId для просмотра спринтов, если JIRA_BOARD_ID не задан.",
    parameters: {
      type: "object",
      properties: {
        projectKeyOrId: {
          type: "string",
          description: "Ключ или id проекта для фильтра",
        },
        name: { type: "string", description: "Подстрока имени доски" },
        maxResults: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    zodSchema: {
      projectKeyOrId: z.string().optional().describe("Ключ или id проекта для фильтра"),
      name: z.string().optional().describe("Подстрока имени доски"),
      maxResults: z.number().int().min(1).max(100).optional(),
    },
    call: (jira, args) => jira.listBoards(args),
  },
  {
    name: "jira_get_sprints",
    title: "Jira: спринты доски",
    description:
      "Спринты доски. state: active — текущий, future — следующие, closed — прошлые. Можно передать несколько через запятую: active,future.",
    parameters: {
      type: "object",
      properties: {
        boardId: {
          description: "ID доски; если не задан, берётся JIRA_BOARD_ID",
        },
        state: {
          type: "string",
          description: "active | future | closed или список через запятую",
        },
        maxResults: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    zodSchema: {
      boardId: z
        .union([z.string(), z.number()])
        .optional()
        .describe("ID доски; если не задан, берётся JIRA_BOARD_ID"),
      state: z
        .string()
        .optional()
        .describe("active | future | closed или список через запятую"),
      maxResults: z.number().int().min(1).max(100).optional(),
    },
    call: (jira, args) => jira.getSprints(args),
  },
  {
    name: "jira_get_sprint_issues",
    title: "Jira: задачи спринта",
    description:
      "Все задачи конкретного спринта по sprintId. Дополнительно можно сузить JQL, например assignee = currentUser().",
    parameters: {
      type: "object",
      properties: {
        sprintId: { description: "ID спринта" },
        jql: {
          type: "string",
          description: "Дополнительный JQL-фильтр внутри спринта",
        },
        maxResults: { type: "integer", minimum: 1, maximum: 100 },
        startAt: { type: "integer", minimum: 0 },
      },
      required: ["sprintId"],
    },
    zodSchema: {
      sprintId: z.union([z.string(), z.number()]).describe("ID спринта"),
      jql: z.string().optional().describe("Дополнительный JQL-фильтр внутри спринта"),
      maxResults: z.number().int().min(1).max(100).optional(),
      startAt: z.number().int().min(0).optional(),
    },
    call: (jira, args) => jira.getSprintIssues(args),
  },
];

function getJiraOpenAiTools() {
  return JIRA_TOOL_CATALOG.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function findJiraTool(name) {
  return JIRA_TOOL_CATALOG.find((tool) => tool.name === name);
}

module.exports = {
  JIRA_TOOL_CATALOG,
  getJiraOpenAiTools,
  findJiraTool,
};
