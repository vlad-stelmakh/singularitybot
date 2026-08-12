"use strict";

/**
 * MCP-сервер Jira по stdio (только чтение).
 * Предназначен для MCP-клиента, а не для ручного ввода в терминале.
 */

const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { JiraMcpServer } = require("./jira/server");
const { resolveJiraRuntimeConfig, HELP_TEXT } = require("./jira/config");

async function startJiraMcpServer() {
  const config = resolveJiraRuntimeConfig();
  if (config.help) {
    console.error(HELP_TEXT);
    process.exit(0);
  }
  if (config.error) {
    console.error(config.error);
    console.error(HELP_TEXT);
    process.exit(1);
  }

  const server = new JiraMcpServer({
    baseUrl: config.baseUrl,
    email: config.email,
    apiToken: config.apiToken,
    projectKey: config.projectKey,
    boardId: config.boardId,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

if (require.main === module) {
  startJiraMcpServer().catch((err) => {
    console.error("Ошибка запуска Jira MCP:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

module.exports = { startJiraMcpServer };
