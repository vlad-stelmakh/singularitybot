"use strict";

/**
 * Универсальный MCP-клиент по stdio: порождает дочерний процесс и
 * отдаёт инструменты в формате OpenAI function calling.
 */

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");

class StdioMcpClient {
  /**
   * @param {object} options
   * @param {string} [options.name]
   * @param {string} options.command
   * @param {string[]} options.args
   * @param {NodeJS.ProcessEnv} [options.env]
   */
  constructor({ name = "stdio-mcp-client", command, args, env }) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.env = env;
    this.client = null;
    this.transport = null;
    this.tools = [];
  }

  async connect() {
    const transportOptions = {
      command: this.command,
      args: this.args,
    };
    if (this.env) transportOptions.env = this.env;

    this.transport = new StdioClientTransport(transportOptions);
    this.client = new Client(
      { name: this.name, version: "1.0.0" },
      { capabilities: {} }
    );

    await this.client.connect(this.transport);

    const { tools } = await this.client.listTools();
    this.tools = tools || [];
    return this.tools;
  }

  getOpenAiTools() {
    return this.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || tool.title || tool.name,
        parameters: normalizeSchema(tool.inputSchema),
      },
    }));
  }

  async callTool(name, args) {
    const result = await this.client.callTool({
      name,
      arguments: args || {},
    });

    const text = (result.content || [])
      .map((part) => (part.type === "text" ? part.text : JSON.stringify(part)))
      .join("\n");

    return { text, isError: Boolean(result.isError) };
  }

  async close() {
    try {
      if (this.client) await this.client.close();
    } catch (_) {
      /* ignore */
    }
  }
}

/**
 * Приводит JSON Schema инструмента к виду, который принимает OpenAI.
 * Гарантирует наличие type: object и объекта properties.
 */
function normalizeSchema(schema) {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }
  const normalized = { ...schema };
  if (!normalized.type) normalized.type = "object";
  if (normalized.type === "object" && !normalized.properties) {
    normalized.properties = {};
  }
  return normalized;
}

module.exports = { StdioMcpClient, normalizeSchema };
