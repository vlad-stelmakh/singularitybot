"use strict";

/**
 * Универсальный MCP-клиент по stdio: порождает дочерний процесс и
 * отдаёт инструменты в формате OpenAI function calling.
 */

const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");
const {
  McpSessionClient,
  normalizeSchema,
} = require("./mcp-session-client");

class StdioMcpClient extends McpSessionClient {
  /**
   * @param {object} options
   * @param {string} [options.name]
   * @param {string} options.command
   * @param {string[]} options.args
   * @param {NodeJS.ProcessEnv} [options.env]
   */
  constructor({ name = "stdio-mcp-client", command, args, env }) {
    super({
      name,
      createTransport: () => {
        const transportOptions = { command, args };
        if (env) transportOptions.env = env;
        return new StdioClientTransport(transportOptions);
      },
    });
    this.command = command;
    this.args = args;
    this.env = env;
  }
}

module.exports = { StdioMcpClient, normalizeSchema };
