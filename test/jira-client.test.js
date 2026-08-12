"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { JiraClient, getJiraErrorMessage } = require("../jira/client");

function fakeHttp(handlers) {
  const calls = [];
  return {
    calls,
    async request(config) {
      calls.push(config);
      const key = `${String(config.method).toUpperCase()} ${config.url}`;
      const handler = handlers[key];
      if (!handler) {
        const err = new Error(`unexpected ${key}`);
        err.response = { status: 500, data: { errorMessages: [`unexpected ${key}`] } };
        throw err;
      }
      if (handler.status && handler.status >= 400) {
        const err = new Error("http error");
        err.response = { status: handler.status, data: handler.data || {} };
        throw err;
      }
      const payload = typeof handler === "function" ? handler(config) : handler;
      return { data: payload };
    },
  };
}

test("извлекает сообщение об ошибке Jira", () => {
  assert.equal(
    getJiraErrorMessage({
      message: "Request failed",
      response: {
        data: {
          errorMessages: ["Issue does not exist"],
          errors: { jql: "bad field" },
        },
      },
    }),
    "Issue does not exist; jql: bad field"
  );
});

test("jira_my_sprint собирает JQL и сжимает задачи", async () => {
  const http = fakeHttp({
    "POST /rest/api/3/search/jql": {
      issues: [
        {
          key: "PROJ-1",
          fields: {
            summary: "Сделать обзор",
            status: { name: "To Do", statusCategory: { name: "To Do" } },
            priority: { name: "Highest" },
            sprint: { id: 5, name: "Sprint 5", state: "active" },
          },
        },
      ],
      total: 1,
    },
    "GET /rest/agile/1.0/board/10/sprint": {
      values: [
        {
          id: 5,
          name: "Sprint 5",
          state: "active",
          startDate: "2026-08-10T00:00:00.000Z",
          endDate: "2026-08-21T00:00:00.000Z",
          goal: "Стабилизировать логин",
        },
      ],
    },
  });

  const client = new JiraClient({
    baseUrl: "https://company.atlassian.net",
    email: "me@example.com",
    apiToken: "token",
    projectKey: "PROJ",
    boardId: "10",
    http,
  });

  const result = await client.mySprint();
  assert.equal(
    result.jql,
    "sprint in openSprints() AND project = PROJ AND assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC, updated DESC"
  );
  assert.equal(result.sprint.name, "Sprint 5");
  assert.equal(result.issues[0].key, "PROJ-1");
  assert.equal(result.issues[0].url, "https://company.atlassian.net/browse/PROJ-1");
});

test("search падает на устаревший GET /search при 404 нового API", async () => {
  const http = fakeHttp({
    "POST /rest/api/3/search/jql": { status: 404, data: { errorMessages: ["not found"] } },
    "GET /rest/api/3/search": {
      issues: [{ key: "PROJ-2", fields: { summary: "Старый поиск" } }],
      total: 1,
    },
  });
  const client = new JiraClient({
    baseUrl: "https://company.atlassian.net",
    email: "me@example.com",
    apiToken: "token",
    http,
  });
  const result = await client.search({ jql: "assignee = currentUser()" });
  assert.equal(result.issues[0].key, "PROJ-2");
  assert.equal(http.calls.length, 2);
});

test("getIssue подмешивает спринт из Agile API", async () => {
  const http = fakeHttp({
    "GET /rest/api/3/issue/PROJ-9": {
      key: "PROJ-9",
      fields: {
        summary: "Карточка",
        description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Текст" }] }] },
        comment: { comments: [] },
      },
    },
    "GET /rest/agile/1.0/issue/PROJ-9": {
      fields: { sprint: { id: 3, name: "Sprint 3", state: "active" } },
    },
  });
  const client = new JiraClient({
    baseUrl: "https://company.atlassian.net",
    email: "me@example.com",
    apiToken: "token",
    http,
  });
  const issue = await client.getIssue("PROJ-9");
  assert.equal(issue.sprint.name, "Sprint 3");
  assert.match(issue.description, /Текст/);
});
