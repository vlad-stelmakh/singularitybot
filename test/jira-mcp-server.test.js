"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("path");

const { JiraMcpServer } = require("../jira/server");

test("JiraMcpServer регистрирует инструменты без обращения к API", () => {
  const server = new JiraMcpServer({
    baseUrl: "https://company.atlassian.net",
    email: "me@example.com",
    apiToken: "token",
    projectKey: "PROJ",
  });
  assert.ok(server.server);
  assert.equal(server.apiClient.projectKey, "PROJ");
});

test("jira-mcp.js --help завершается без ошибки", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "jira-mcp.js"), "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /MCP-сервера Jira/);
});

test("jira-mcp.js без credentials завершается с ошибкой", () => {
  const env = { ...process.env };
  for (const key of [
    "JIRA_BASE_URL",
    "JIRA_HOST",
    "JIRA_URL",
    "JIRA_EMAIL",
    "JIRA_USERNAME",
    "JIRA_API_TOKEN",
  ]) {
    delete env[key];
  }
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "jira-mcp.js"), "-n"], {
    encoding: "utf8",
    env,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Не заданы параметры Jira/);
});
