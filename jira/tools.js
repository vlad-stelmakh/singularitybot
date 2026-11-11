"use strict";

const { success, error } = require("../utils/response");
const { JIRA_TOOL_CATALOG } = require("./tool-catalog");

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
  for (const tool of JIRA_TOOL_CATALOG) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.zodSchema,
      },
      wrap((args) => tool.call(jira, args))
    );
  }
}

module.exports = { registerJiraTools };
