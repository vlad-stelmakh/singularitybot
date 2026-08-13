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

test("без Jira возвращает клиент Singularity как есть", async () => {
  const pool = new McpClientPool({
    createClient: () => ({
      connect: async () => {},
      close: async () => {},
      getOpenAiTools: () => [
        { type: "function", function: { name: "listTasks", parameters: {} } },
      ],
    }),
  });
  const client = await pool.getClient("111", "token-a");
  assert.equal(client.getOpenAiTools()[0].function.name, "listTasks");
});

test("с Jira отдаёт составной клиент с инструментами обеих систем", async () => {
  const pool = new McpClientPool({
    jira: { enabled: true, baseUrl: "https://company.atlassian.net" },
    createClient: () => ({
      connect: async () => {},
      close: async () => {},
      getOpenAiTools: () => [
        { type: "function", function: { name: "listTasks", parameters: {} } },
      ],
      callTool: async (name) => ({ text: name, isError: false }),
    }),
    createJiraClient: () => ({
      connect: async () => {},
      close: async () => {},
      getOpenAiTools: () => [
        { type: "function", function: { name: "jira_my_sprint", parameters: {} } },
      ],
      callTool: async (name) => ({ text: name, isError: false }),
    }),
  });

  const client = await pool.getClient("111", "token-a");
  const names = client.getOpenAiTools().map((tool) => tool.function.name);
  assert.deepEqual(names, ["listTasks", "jira_my_sprint"]);
  const again = await pool.getClient("222", "token-b");
  assert.deepEqual(
    again.getOpenAiTools().map((tool) => tool.function.name),
    ["listTasks", "jira_my_sprint"]
  );
});

test("если Jira не подключается, бот продолжает работать через Singularity", async () => {
  const pool = new McpClientPool({
    jira: { enabled: true, baseUrl: "https://company.atlassian.net" },
    createClient: () => ({
      connect: async () => {},
      close: async () => {},
      getOpenAiTools: () => [
        { type: "function", function: { name: "listTasks", parameters: {} } },
      ],
    }),
    createJiraClient: () => ({
      connect: async () => {
        throw new Error("Jira unauthorized");
      },
      close: async () => {},
    }),
  });

  const warn = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warn.push(args.join(" "));
  try {
    const client = await pool.getClient("111", "token-a");
    assert.equal(client.getOpenAiTools()[0].function.name, "listTasks");
    assert.equal(pool.jiraDisabled, true);
    assert.match(warn.join("\n"), /Jira MCP не удалось подключить/);
  } finally {
    console.warn = originalWarn;
  }
});
