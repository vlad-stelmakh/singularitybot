"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildOfficialMcpUrl,
  parseMcpTransport,
  parseBooleanEnv,
  DEFAULT_SINGULARITY_MCP_URL,
} = require("../bot/http-mcp-client");
const { createSingularityMcpClient } = require("../bot/mcp-client");
const { HttpMcpClient } = require("../bot/http-mcp-client");
const { StdioSingularityMcpClient } = require("../bot/mcp-client");

test("URL официального MCP по умолчанию", () => {
  assert.equal(DEFAULT_SINGULARITY_MCP_URL, "https://mcp.singularity-app.com/mcp");
  assert.equal(
    buildOfficialMcpUrl(),
    "https://mcp.singularity-app.com/mcp"
  );
  assert.equal(
    buildOfficialMcpUrl("https://mcp.singularity-app.com/mcp", "tasks,projects"),
    "https://mcp.singularity-app.com/mcp?toolsets=tasks%2Cprojects"
  );
});

test("разбирает транспорт и boolean-флаги", () => {
  assert.equal(parseMcpTransport(undefined), "http");
  assert.equal(parseMcpTransport("STDIO"), "stdio");
  assert.throws(() => parseMcpTransport("ws"), /Некорректный SINGULARITY_MCP_TRANSPORT/);
  assert.equal(parseBooleanEnv(undefined, true), true);
  assert.equal(parseBooleanEnv("false", true), false);
  assert.equal(parseBooleanEnv("1", false), true);
});

test("фабрика создаёт HTTP-клиент по умолчанию", () => {
  const client = createSingularityMcpClient({
    accessToken: "token",
  });
  assert.equal(client instanceof HttpMcpClient, true);
  assert.equal(client.url, "https://mcp.singularity-app.com/mcp");
});

test("фабрика создаёт stdio-клиент по флагу", () => {
  const client = createSingularityMcpClient({
    transport: "stdio",
    entryPoint: "/tmp/mcp.js",
    baseUrl: "https://api.singularity-app.com",
    accessToken: "token",
  });
  assert.equal(client instanceof StdioSingularityMcpClient, true);
  assert.deepEqual(client.args, [
    "/tmp/mcp.js",
    "--baseUrl",
    "https://api.singularity-app.com",
    "--accessToken",
    "token",
    "-n",
  ]);
});
