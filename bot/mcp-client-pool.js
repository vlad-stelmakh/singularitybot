"use strict";

const { SingularityMcpClient } = require("./mcp-client");

/**
 * Лениво создаёт отдельный MCP-процесс для каждого Telegram-пользователя.
 * Экземпляры не делят access token, поэтому операции одного пользователя
 * не могут выполняться от имени другого аккаунта Singularity.
 */
class McpClientPool {
  constructor({ entryPoint, baseUrl, createClient } = {}) {
    this.entryPoint = entryPoint;
    this.baseUrl = baseUrl;
    this.createClient =
      createClient ||
      ((options) => new SingularityMcpClient(options));
    this.clients = new Map();
    this.connecting = new Map();
  }

  async getClient(userId, accessToken) {
    const existing = this.clients.get(userId);
    if (existing) return existing;

    const pending = this.connecting.get(userId);
    if (pending) return pending;

    const connection = (async () => {
      const client = this.createClient({
        entryPoint: this.entryPoint,
        baseUrl: this.baseUrl,
        accessToken,
      });
      await client.connect();
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

  async close() {
    await Promise.all(
      [...this.clients.values()].map((client) => client.close())
    );
    this.clients.clear();
  }
}

module.exports = { McpClientPool };
