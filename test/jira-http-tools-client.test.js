"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { JiraHttpToolsClient } = require("../jira/http-tools-client");
const { createDefaultJiraClient } = require("../bot/mcp-client-pool");
const { StdioMcpClient } = require("../bot/stdio-mcp-client");

test("HTTP-клиент отдаёт каталог tools и вызывает REST-обёртку", async () => {
  const calls = [];
  const jiraClient = {
    getMyself: async () => {
      calls.push("myself");
      return { displayName: "Иван" };
    },
    mySprint: async (args) => {
      calls.push(["sprint", args]);
      return { issues: [{ key: "PROJ-1" }], mineOnly: args.mineOnly };
    },
  };
  const client = new JiraHttpToolsClient({ jiraClient });

  await client.connect();
  assert.deepEqual(calls, ["myself"]);

  const names = client.getOpenAiTools().map((tool) => tool.function.name);
  assert.ok(names.includes("jira_my_sprint"));
  assert.ok(names.includes("jira_search"));

  const result = await client.callTool("jira_my_sprint", { mineOnly: false });
  assert.equal(result.isError, false);
  assert.match(result.text, /PROJ-1/);
  assert.deepEqual(calls[1], ["sprint", { mineOnly: false }]);
});

test("неизвестный инструмент и ошибка API возвращаются как isError", async () => {
  const client = new JiraHttpToolsClient({
    jiraClient: {
      getIssue: async () => {
        throw new Error("Issue does not exist");
      },
    },
  });

  const unknown = await client.callTool("jira_delete", {});
  assert.equal(unknown.isError, true);
  assert.match(unknown.text, /Неизвестный инструмент/);

  const failed = await client.callTool("jira_get_issue", { issueKey: "PROJ-0" });
  assert.equal(failed.isError, true);
  assert.match(failed.text, /Issue does not exist/);
});

test("фабрика: http по умолчанию, mcp — stdio-процесс", () => {
  const http = createDefaultJiraClient({
    transport: "http",
    baseUrl: "https://company.atlassian.net",
    email: "me@example.com",
    apiToken: "secret",
  });
  assert.equal(http instanceof JiraHttpToolsClient, true);

  const mcp = createDefaultJiraClient({
    transport: "mcp",
    entryPoint: "/tmp/jira-mcp.js",
    baseUrl: "https://company.atlassian.net",
    email: "me@example.com",
    apiToken: "secret",
  });
  assert.equal(mcp instanceof StdioMcpClient, true);
  assert.equal(mcp.args[0], "/tmp/jira-mcp.js");
});
