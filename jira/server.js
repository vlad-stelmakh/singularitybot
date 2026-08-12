"use strict";

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { JiraClient } = require("./client");
const { registerJiraTools } = require("./tools");

class JiraMcpServer {
  /**
   * @param {object} config
   * @param {string} config.baseUrl
   * @param {string} config.email
   * @param {string} config.apiToken
   * @param {string} [config.projectKey]
   * @param {string} [config.boardId]
   */
  constructor(config) {
    this.server = new McpServer({
      name: "jira-mcp-server",
      version: "1.0.0",
    });
    this.apiClient = new JiraClient(config);
    registerJiraTools(this.server, this.apiClient);
  }

  async connect(transport) {
    return this.server.connect(transport);
  }
}

module.exports = { JiraMcpServer };
