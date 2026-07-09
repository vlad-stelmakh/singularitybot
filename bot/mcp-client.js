"use strict";

/**
 * Обёртка над MCP-сервером Singularity.
 *
 * Запускает существующий сервер (mcp.js) как дочерний процесс через stdio,
 * подключается к нему как MCP-клиент, получает список инструментов и
 * предоставляет их в формате function-calling для OpenAI.
 */

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");

class SingularityMcpClient {
  /**
   * @param {object} options
   * @param {string} options.entryPoint - путь до mcp.js
   * @param {string} options.baseUrl - URL API Singularity
   * @param {string} options.accessToken - токен доступа к API
   */
  constructor({ entryPoint, baseUrl, accessToken }) {
    this.entryPoint = entryPoint;
    this.baseUrl = baseUrl;
    this.accessToken = accessToken;
    this.client = null;
    this.transport = null;
    this.tools = [];
  }

  /**
   * Подключается к MCP-серверу и загружает список инструментов.
   */
  async connect() {
    this.transport = new StdioClientTransport({
      command: process.execPath, // node
      args: [
        this.entryPoint,
        "--baseUrl",
        this.baseUrl,
        "--accessToken",
        this.accessToken,
        "-n",
      ],
    });

    this.client = new Client(
      { name: "singularity-telegram-agent", version: "1.0.0" },
      { capabilities: {} }
    );

    await this.client.connect(this.transport);

    const { tools } = await this.client.listTools();
    this.tools = tools || [];
    return this.tools;
  }

  /**
   * Возвращает инструменты в формате OpenAI Chat Completions.
   * @returns {Array<object>}
   */
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

  /**
   * Вызывает инструмент MCP по имени.
   * @param {string} name
   * @param {object} args
   * @returns {Promise<{ text: string, isError: boolean }>}
   */
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

module.exports = { SingularityMcpClient };
