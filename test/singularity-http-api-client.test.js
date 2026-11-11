"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { SingularityHttpApiClient } = require("../bot/singularity-http-api-client");
const { SingularityMcpServer } = require("../server");

test("in-process HTTP API клиент отдаёт tools Singularity без stdio", async () => {
  const client = new SingularityHttpApiClient({
    baseUrl: "https://api.singularity-app.com",
    accessToken: "token",
    createServer: () =>
      new SingularityMcpServer({
        baseUrl: "https://api.singularity-app.com",
        accessToken: "token",
        enableLogging: false,
      }),
  });

  const tools = await client.connect();
  const names = tools.map((tool) => tool.name);
  assert.ok(names.includes("listTasks"));
  assert.ok(names.includes("createTask"));
  assert.ok(names.includes("listProjects"));
  assert.ok(client.getOpenAiTools().some((tool) => tool.function.name === "listTasks"));
  await client.close();
});
