"use strict";

/**
 * Общая сессия MCP-клиента: транспорт подключается снаружи,
 * а список инструментов и вызовы одинаковы для stdio и HTTP.
 */

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");

class McpSessionClient {
  /**
   * @param {object} options
   * @param {string} [options.name]
   * @param {() => object} options.createTransport
   */
  constructor({ name = "mcp-client", createTransport }) {
    this.name = name;
    this.createTransport = createTransport;
    this.client = null;
    this.transport = null;
    this.tools = [];
  }

  async connect() {
    this.transport = this.createTransport();
    this.client = new Client(
      { name: this.name, version: "1.0.0" },
      { capabilities: {} }
    );

    await this.client.connect(this.transport);
    this.tools = await listAllTools(this.client);
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

async function listAllTools(client) {
  const tools = [];
  let cursor;
  do {
    const result = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...(result.tools || []));
    cursor = result.nextCursor;
  } while (cursor);
  return tools;
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

module.exports = { McpSessionClient, normalizeSchema, listAllTools };
