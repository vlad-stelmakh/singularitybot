"use strict";

const { z } = require("zod");
const { success, error } = require("../utils/response");

function wrap(fn) {
  return async (args) => {
    try {
      return success(await fn(args || {}));
    } catch (err) {
      return error(err instanceof Error ? err : String(err));
    }
  };
}

/**
 * Регистрирует read-only инструменты Jira.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('./client').JiraClient} jira
 */
function registerJiraTools(server, jira) {
  server.registerTool(
    "jira_myself",
    {
      title: "Jira: текущий пользователь",
      description:
        "Возвращает аккаунт Jira, от имени которого идут запросы (displayName, email, timezone). Вызови, если нужно понять, чей это спринт.",
      inputSchema: {},
    },
    wrap(() => jira.getMyself())
  );

  server.registerTool(
    "jira_my_sprint",
    {
      title: "Jira: мой текущий спринт",
      description:
        "Быстрый обзор активного спринта: задачи из openSprints(). По умолчанию только назначенные на текущего пользователя и без Done. Используй это первым, когда спрашивают «что в спринте», «на чём сфокусироваться», «какие рабочие задачи».",
      inputSchema: {
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
    },
    wrap((args) => jira.mySprint(args))
  );

  server.registerTool(
    "jira_search",
    {
      title: "Jira: поиск по JQL",
      description:
        "Ищет задачи по JQL. Примеры: 'assignee = currentUser() AND statusCategory != Done', 'sprint in openSprints()', 'key = PROJ-123'. Не выдумывай ключи проектов — уточни или возьми из jira_list_boards / jira_my_sprint.",
      inputSchema: {
        jql: z.string().describe("JQL-запрос"),
        maxResults: z.number().int().min(1).max(100).optional(),
        nextPageToken: z.string().optional().describe("Токен следующей страницы из предыдущего ответа"),
      },
    },
    wrap((args) => jira.search(args))
  );

  server.registerTool(
    "jira_get_issue",
    {
      title: "Jira: детали задачи",
      description:
        "Карточка задачи по ключу (PROJ-123): описание, статус, приоритет, спринт, суброадмап, связи и последние комментарии.",
      inputSchema: {
        issueKey: z.string().describe("Ключ задачи, например PROJ-123"),
      },
    },
    wrap(({ issueKey }) => jira.getIssue(issueKey))
  );

  server.registerTool(
    "jira_list_boards",
    {
      title: "Jira: список досок",
      description:
        "Список Scrum/Kanban досок. Нужен, чтобы узнать boardId для просмотра спринтов, если JIRA_BOARD_ID не задан.",
      inputSchema: {
        projectKeyOrId: z.string().optional().describe("Ключ или id проекта для фильтра"),
        name: z.string().optional().describe("Подстрока имени доски"),
        maxResults: z.number().int().min(1).max(100).optional(),
      },
    },
    wrap((args) => jira.listBoards(args))
  );

  server.registerTool(
    "jira_get_sprints",
    {
      title: "Jira: спринты доски",
      description:
        "Спринты доски. state: active — текущий, future — следующие, closed — прошлые. Можно передать несколько через запятую: active,future.",
      inputSchema: {
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
    },
    wrap((args) => jira.getSprints(args))
  );

  server.registerTool(
    "jira_get_sprint_issues",
    {
      title: "Jira: задачи спринта",
      description:
        "Все задачи конкретного спринта по sprintId. Дополнительно можно сузить JQL, например assignee = currentUser().",
      inputSchema: {
        sprintId: z.union([z.string(), z.number()]).describe("ID спринта"),
        jql: z.string().optional().describe("Дополнительный JQL-фильтр внутри спринта"),
        maxResults: z.number().int().min(1).max(100).optional(),
        startAt: z.number().int().min(0).optional(),
      },
    },
    wrap((args) => jira.getSprintIssues(args))
  );
}

module.exports = { registerJiraTools };
