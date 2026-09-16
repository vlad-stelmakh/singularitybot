"use strict";

/**
 * MCP-клиент по Streamable HTTP — для официального сервера
 * https://mcp.singularity-app.com/mcp
 */

const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const { McpSessionClient } = require("./mcp-session-client");

const DEFAULT_SINGULARITY_MCP_URL = "https://mcp.singularity-app.com/mcp";

class HttpMcpClient extends McpSessionClient {
  /**
   * @param {object} options
   * @param {string} options.url
   * @param {string} options.accessToken
   * @param {string} [options.name]
   * @param {Record<string, string>} [options.headers]
   * @param {() => object} [options.createTransport]
   */
  constructor({
    url,
    accessToken,
    name = "singularity-http-mcp",
    headers,
    createTransport,
  }) {
    const requestHeaders = {
      Authorization: `Bearer ${accessToken}`,
      ...(headers || {}),
    };
    super({
      name,
      createTransport:
        createTransport ||
        (() =>
          new StreamableHTTPClientTransport(new URL(url), {
            requestInit: { headers: requestHeaders },
          })),
    });
    this.url = url;
    this.accessToken = accessToken;
  }
}

function buildOfficialMcpUrl(url = DEFAULT_SINGULARITY_MCP_URL, toolsets) {
  const trimmed = String(url || DEFAULT_SINGULARITY_MCP_URL).trim();
  if (!toolsets || !String(toolsets).trim()) return trimmed;
  const parsed = new URL(trimmed);
  parsed.searchParams.set("toolsets", String(toolsets).trim());
  return parsed.toString();
}

function parseMcpTransport(raw) {
  const value = String(raw || "http").trim().toLowerCase();
  if (value === "stdio" || value === "http") return value;
  throw new Error(
    `Некорректный SINGULARITY_MCP_TRANSPORT="${raw}". Используйте http или stdio.`
  );
}

function parseBooleanEnv(raw, defaultValue) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return defaultValue;
  }
  const value = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return defaultValue;
}

module.exports = {
  HttpMcpClient,
  DEFAULT_SINGULARITY_MCP_URL,
  buildOfficialMcpUrl,
  parseMcpTransport,
  parseBooleanEnv,
};
