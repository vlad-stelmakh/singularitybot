"use strict";

const path = require("path");
const { createSingularityMcpClient } = require("./mcp-client");
const { StdioMcpClient } = require("./stdio-mcp-client");
const { CompositeMcpClient } = require("./composite-mcp-client");
const { buildJiraMcpArgs } = require("../jira/config");
const {
  DEFAULT_SINGULARITY_MCP_URL,
  buildOfficialMcpUrl,
} = require("./http-mcp-client");

/**
 * Лениво создаёт отдельный MCP-процесс/сессию для каждого Telegram-пользователя.
 * Экземпляры не делят access token, поэтому операции одного пользователя
 * не могут выполняться от имени другого аккаунта Singularity.
 *
 * По умолчанию бот подключается к официальному HTTP MCP
 * (https://mcp.singularity-app.com/mcp). Если сервер отклоняет токен
 * (нужен OAuth, а не API-ключ) или недоступен — можно откатиться
 * на встроенный mcp.js по stdio.
 *
 * Опциональный Jira MCP общий для процесса: это один рабочий аккаунт.
 */
class McpClientPool {
  constructor({
    entryPoint,
    baseUrl,
    jira,
    mcpUrl,
    mcpTransport,
    mcpToolsets,
    mcpFallbackToStdio,
    createClient,
    createStdioClient,
    createJiraClient,
  } = {}) {
    this.entryPoint = entryPoint;
    this.baseUrl = baseUrl;
    this.mcpUrl = buildOfficialMcpUrl(
      mcpUrl || DEFAULT_SINGULARITY_MCP_URL,
      mcpToolsets
    );
    this.mcpTransport = mcpTransport || "http";
    this.mcpToolsets = mcpToolsets;
    this.mcpFallbackToStdio =
      mcpFallbackToStdio === undefined ? true : Boolean(mcpFallbackToStdio);
    this.jira = jira && jira.enabled ? jira : null;
    this.createClient =
      createClient ||
      ((options) => createSingularityMcpClient(options));
    this.createStdioClient =
      createStdioClient ||
      ((options) =>
        createSingularityMcpClient({ ...options, transport: "stdio" }));
    this.createJiraClient =
      createJiraClient ||
      ((options) => createDefaultJiraClient(options));
    this.clients = new Map();
    this.connecting = new Map();
    this.jiraClient = null;
    this.jiraConnecting = null;
    this.jiraDisabled = false;
  }

  async getSingularityClient(userId, accessToken) {
    const existing = this.clients.get(userId);
    if (existing) return existing;

    const pending = this.connecting.get(userId);
    if (pending) return pending;

    const connection = (async () => {
      const client = await this.connectSingularityClient(accessToken);
      this.clients.set(userId, client);
      return client;
    })();

    this.connecting.set(userId, connection);
    try {
      return await connection;
    } finally {
      this.connecting.delete(userId);
    }
  }

  async connectSingularityClient(accessToken) {
    const preferred = this.createClient({
      transport: this.mcpTransport,
      url: this.mcpUrl,
      toolsets: this.mcpToolsets,
      entryPoint: this.entryPoint,
      baseUrl: this.baseUrl,
      accessToken,
    });

    try {
      await preferred.connect();
      return preferred;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const canFallback =
        this.mcpTransport !== "stdio" && this.mcpFallbackToStdio;
      if (!canFallback) throw err;

      console.warn(
        `[warn] Официальный MCP ${this.mcpUrl} недоступен (${message}). ` +
          "Переключаюсь на встроенный mcp.js по stdio."
      );
      const fallback = this.createStdioClient({
        transport: "stdio",
        entryPoint: this.entryPoint,
        baseUrl: this.baseUrl,
        accessToken,
      });
      await fallback.connect();
      return fallback;
    }
  }

  async getJiraClient() {
    if (!this.jira || this.jiraDisabled) return null;
    if (this.jiraClient) return this.jiraClient;
    if (this.jiraConnecting) return this.jiraConnecting;

    const connection = (async () => {
      try {
        const client = this.createJiraClient(this.jira);
        await client.connect();
        this.jiraClient = client;
        return client;
      } catch (err) {
        this.jiraDisabled = true;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[warn] Jira MCP не удалось подключить, бот работает без него: ${message}`
        );
        return null;
      }
    })();

    this.jiraConnecting = connection;
    try {
      return await connection;
    } finally {
      this.jiraConnecting = null;
    }
  }

  async getClient(userId, accessToken) {
    const singularity = await this.getSingularityClient(userId, accessToken);
    const jira = await this.getJiraClient();
    if (!jira) return singularity;
    return new CompositeMcpClient([singularity, jira]);
  }

  async close() {
    const closing = [...this.clients.values()].map((client) => client.close());
    if (this.jiraClient) closing.push(this.jiraClient.close());
    await Promise.all(closing);
    this.clients.clear();
    this.jiraClient = null;
  }
}

function createDefaultJiraClient(jira) {
  const entryPoint =
    jira.entryPoint || path.join(__dirname, "..", "jira-mcp.js");
  return new StdioMcpClient({
    name: "jira-telegram-agent",
    command: process.execPath,
    args: buildJiraMcpArgs({
      entryPoint,
      baseUrl: jira.baseUrl,
      email: jira.email,
      apiToken: jira.apiToken,
      projectKey: jira.projectKey,
      boardId: jira.boardId,
    }),
  });
}

module.exports = { McpClientPool };
