"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { McpClientPool } = require("../bot/mcp-client-pool");

test("создаёт отдельный MCP-клиент для каждого Telegram ID", async () => {
  const created = [];
  const pool = new McpClientPool({
    entryPoint: "/tmp/mcp.js",
    baseUrl: "https://example.test",
    createClient: (options) => {
      const client = {
        options,
        connect: async () => {},
        close: async () => {},
      };
      created.push(client);
      return client;
    },
  });

  const first = await pool.getClient("111", "token-a");
  const firstAgain = await pool.getClient("111", "token-a");
  const second = await pool.getClient("222", "token-b");

  assert.equal(first, firstAgain);
  assert.notEqual(first, second);
  assert.deepEqual(
    created.map((client) => client.options.accessToken),
    ["token-a", "token-b"]
  );
});

test("не создаёт два клиента при одновременном первом запросе", async () => {
  let resolveConnect;
  let createCount = 0;
  const pool = new McpClientPool({
    createClient: () => {
      createCount += 1;
      return {
        connect: () =>
          new Promise((resolve) => {
            resolveConnect = resolve;
          }),
        close: async () => {},
      };
    },
  });

  const first = pool.getClient("111", "token-a");
  const second = pool.getClient("111", "token-a");
  resolveConnect();

  assert.equal(await first, await second);
  assert.equal(createCount, 1);
});
