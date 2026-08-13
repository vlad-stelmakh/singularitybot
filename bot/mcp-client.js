"use strict";

/**
 * Обёртка над MCP-сервером Singularity.
 *
 * Запускает существующий сервер (mcp.js) как дочерний процесс через stdio,
 * подключается к нему как MCP-клиент, получает список инструментов и
 * предоставляет их в формате function-calling для OpenAI.
 */

const { StdioMcpClient } = require("./stdio-mcp-client");

class SingularityMcpClient extends StdioMcpClient {
  /**
   * @param {object} options
   * @param {string} options.entryPoint - путь до mcp.js
   * @param {string} options.baseUrl - URL API Singularity
   * @param {string} options.accessToken - токен доступа к API
   */
  constructor({ entryPoint, baseUrl, accessToken }) {
    super({
      name: "singularity-telegram-agent",
      command: process.execPath,
      args: [
        entryPoint,
        "--baseUrl",
        baseUrl,
        "--accessToken",
        accessToken,
        "-n",
      ],
    });
    this.entryPoint = entryPoint;
    this.baseUrl = baseUrl;
    this.accessToken = accessToken;
  }
}

module.exports = { SingularityMcpClient };
