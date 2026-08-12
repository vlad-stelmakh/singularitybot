"use strict";

/**
 * Объединяет инструменты нескольких MCP-клиентов в один фасад
 * с тем же интерфейсом, что у StdioMcpClient / SingularityMcpClient.
 */
class CompositeMcpClient {
  /**
   * @param {Array<{ getOpenAiTools: Function, callTool: Function, close?: Function }>} clients
   * @param {object} [options]
   * @param {boolean} [options.closeChildren=false] — пул владеет процессами, фасад их не закрывает
   */
  constructor(clients, { closeChildren = false } = {}) {
    this.clients = clients.filter(Boolean);
    this.toolOwners = new Map();
    this.closeChildren = closeChildren;
  }

  getOpenAiTools() {
    const tools = [];
    this.toolOwners.clear();
    for (const client of this.clients) {
      for (const tool of client.getOpenAiTools()) {
        const name = tool.function && tool.function.name;
        if (!name) continue;
        if (this.toolOwners.has(name)) {
          throw new Error(`Конфликт имён MCP-инструментов: ${name}`);
        }
        this.toolOwners.set(name, client);
        tools.push(tool);
      }
    }
    return tools;
  }

  async callTool(name, args) {
    const owner = this.toolOwners.get(name);
    if (!owner) {
      // getOpenAiTools мог ещё не вызываться (например, в тестах)
      for (const client of this.clients) {
        const names = client
          .getOpenAiTools()
          .map((tool) => tool.function && tool.function.name);
        if (names.includes(name)) {
          this.toolOwners.set(name, client);
          return client.callTool(name, args);
        }
      }
      throw new Error(`Неизвестный инструмент MCP: ${name}`);
    }
    return owner.callTool(name, args);
  }

  async close() {
    if (!this.closeChildren) return;
    await Promise.all(
      this.clients.map((client) =>
        typeof client.close === "function" ? client.close() : Promise.resolve()
      )
    );
  }
}

module.exports = { CompositeMcpClient };
