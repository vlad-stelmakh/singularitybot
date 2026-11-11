"use strict";

/**
 * Клиент Singularity без внешнего MCP: те же tools, что у mcp.js,
 * но вызовы идут в REST API (api.singularity-app.com) в том же процессе.
 */

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  InMemoryTransport,
} = require("@modelcontextprotocol/sdk/inMemory.js");
const { SingularityMcpServer } = require("../server");
const { listAllTools, normalizeSchema } = require("./mcp-session-client");

class SingularityHttpApiClient {
  /**
   * @param {object} options
   * @param {string} options.baseUrl
   * @param {string} options.accessToken
   * @param {(config: object) => { connect: Function }} [options.createServer]
   */
  constructor({ baseUrl, accessToken, createServer }) {
    this.baseUrl = baseUrl;
    this.accessToken = accessToken;
    this.createServer =
      createServer ||
      ((config) => new SingularityMcpServer(config));
    this.client = null;
    this.mcpServer = null;
    this.tools = [];
  }

  async connect() {
    this.mcpServer = this.createServer({
      baseUrl: this.baseUrl,
      accessToken: this.accessToken,
      enableLogging: false,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    this.client = new Client(
      { name: "singularity-http-api", version: "1.0.0" },
      { capabilities: {} }
    );

    await Promise.all([
      this.mcpServer.connect(serverTransport),
      this.client.connect(clientTransport),
    ]);

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

module.exports = { SingularityHttpApiClient };
