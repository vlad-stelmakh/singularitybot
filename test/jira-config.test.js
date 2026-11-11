"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeJiraBaseUrl,
  parseJiraConfig,
  parseCliArgs,
  resolveJiraRuntimeConfig,
  buildJiraMcpArgs,
} = require("../jira/config");

test("нормализует URL Jira", () => {
  assert.equal(
    normalizeJiraBaseUrl("company.atlassian.net"),
    "https://company.atlassian.net"
  );
  assert.equal(
    normalizeJiraBaseUrl("https://company.atlassian.net/"),
    "https://company.atlassian.net"
  );
  assert.equal(normalizeJiraBaseUrl("  "), "");
});

test("выключает Jira, если переменные не заданы", () => {
  assert.deepEqual(parseJiraConfig({}), { enabled: false });
});

test("помечает неполную конфигурацию Jira", () => {
  const parsed = parseJiraConfig({
    JIRA_BASE_URL: "https://company.atlassian.net",
    JIRA_EMAIL: "me@example.com",
  });
  assert.equal(parsed.enabled, false);
  assert.equal(parsed.incomplete, true);
  assert.deepEqual(parsed.missing, ["JIRA_API_TOKEN"]);
});

test("принимает JIRA_HOST и JIRA_USERNAME", () => {
  const parsed = parseJiraConfig({
    JIRA_HOST: "company.atlassian.net",
    JIRA_USERNAME: "me@example.com",
    JIRA_API_TOKEN: "secret",
    JIRA_PROJECT_KEY: "PROJ",
    JIRA_BOARD_ID: "42",
  });
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.baseUrl, "https://company.atlassian.net");
  assert.equal(parsed.email, "me@example.com");
  assert.equal(parsed.projectKey, "PROJ");
  assert.equal(parsed.boardId, "42");
});

test("разбирает CLI и перекрывает env", () => {
  const runtime = resolveJiraRuntimeConfig({
    env: {
      JIRA_BASE_URL: "https://from-env.atlassian.net",
      JIRA_EMAIL: "env@example.com",
      JIRA_API_TOKEN: "env-token",
    },
    argv: ["--baseUrl", "https://from-cli.atlassian.net", "--noLog"],
  });
  assert.equal(runtime.baseUrl, "https://from-cli.atlassian.net");
  assert.equal(runtime.email, "env@example.com");
  assert.equal(runtime.enableLogging, false);
});

test("собирает аргументы дочернего процесса Jira MCP", () => {
  assert.deepEqual(
    buildJiraMcpArgs({
      entryPoint: "/app/jira-mcp.js",
      baseUrl: "https://company.atlassian.net",
      email: "me@example.com",
      apiToken: "secret",
      projectKey: "PROJ",
      boardId: "7",
    }),
    [
      "/app/jira-mcp.js",
      "--baseUrl",
      "https://company.atlassian.net",
      "--email",
      "me@example.com",
      "--apiToken",
      "secret",
      "-n",
      "--projectKey",
      "PROJ",
      "--boardId",
      "7",
    ]
  );
});

test("parseCliArgs понимает короткие флаги", () => {
  const parsed = parseCliArgs(["-u", "https://x.atlassian.net", "-e", "a@b.c", "-t", "tok", "-h"]);
  assert.equal(parsed.baseUrl, "https://x.atlassian.net");
  assert.equal(parsed.email, "a@b.c");
  assert.equal(parsed.apiToken, "tok");
  assert.equal(parsed.help, true);
});
