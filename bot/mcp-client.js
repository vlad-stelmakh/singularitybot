"use strict";

/**
 * Клиент MCP SingularityApp для Telegram-бота.
 *
 * Фабрика MCP-клиентов SingularityApp: официальный hosted MCP (http)
 * или локальный mcp.js (stdio). REST API — см. singularity-http-api-client.js.
 */

const { StdioMcpClient } = require("./stdio-mcp-client");
const {
  HttpMcpClient,
  DEFAULT_SINGULARITY_MCP_URL,
  buildOfficialMcpUrl,
} = require("./http-mcp-client");

class StdioSingularityMcpClient extends StdioMcpClient {
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
    this.transportKind = "stdio";
  }
}

/**
 * Совместимое имя: раньше бот всегда ходил в локальный mcp.js.
 * Сейчас фабрика выбирает HTTP или stdio.
 */
class SingularityMcpClient extends StdioSingularityMcpClient {}

function createSingularityMcpClient({
  transport = "http",
  url = DEFAULT_SINGULARITY_MCP_URL,
  toolsets,
  entryPoint,
  baseUrl,
  accessToken,
} = {}) {
  if (transport === "stdio") {
    return new StdioSingularityMcpClient({
      entryPoint,
      baseUrl,
      accessToken,
    });
  }

  return new HttpMcpClient({
    name: "singularity-telegram-agent",
    url: buildOfficialMcpUrl(url, toolsets),
    accessToken,
  });
}

module.exports = {
  SingularityMcpClient,
  StdioSingularityMcpClient,
  createSingularityMcpClient,
};
