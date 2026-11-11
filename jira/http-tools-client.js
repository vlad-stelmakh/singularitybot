"use strict";

/**
 * Клиент Jira без MCP: те же tools, что у jira-mcp.js, но вызовы идут
 * напрямую в REST API. Нужен, когда stdio MCP нестабилен.
 */

const { JiraClient } = require("./client");
const { getJiraOpenAiTools, findJiraTool } = require("./tool-catalog");

class JiraHttpToolsClient {
  /**
   * @param {object} options
   * @param {string} options.baseUrl
   * @param {string} options.email
   * @param {string} options.apiToken
   * @param {string} [options.projectKey]
   * @param {string} [options.boardId]
   * @param {import('./client').JiraClient} [options.jiraClient]
   */
  constructor(options) {
    this.jira = options.jiraClient || new JiraClient(options);
    this.baseUrl = options.baseUrl;
  }

  async connect() {
    await this.jira.getMyself();
    return this.getOpenAiTools();
  }

  getOpenAiTools() {
    return getJiraOpenAiTools();
  }

  async callTool(name, args) {
    const tool = findJiraTool(name);
    if (!tool) {
      return { text: `Неизвестный инструмент Jira: ${name}`, isError: true };
    }
    try {
      const result = await tool.call(this.jira, args || {});
      const text =
        typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return { text, isError: false };
    } catch (err) {
      return {
        text: err instanceof Error ? err.message : String(err),
        isError: true,
      };
    }
  }

  async close() {
    /* HTTP-клиент не держит дочерний процесс */
  }
}

module.exports = { JiraHttpToolsClient };
