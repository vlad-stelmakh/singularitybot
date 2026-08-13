"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  adfToText,
  summarizeIssue,
  summarizeIssueDetails,
} = require("../jira/format");

test("извлекает текст из ADF", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Нужно " },
          { type: "text", text: "проверить" },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "второй абзац" }],
      },
    ],
  };
  assert.equal(adfToText(doc).trim(), "Нужно проверить\nвторой абзац");
});

test("сжимает задачу для обзора спринта", () => {
  const summary = summarizeIssue(
    {
      key: "PROJ-12",
      fields: {
        summary: "Починить логин",
        issuetype: { name: "Bug" },
        status: { name: "In Progress", statusCategory: { name: "In Progress" } },
        priority: { name: "High" },
        assignee: { displayName: "Иван", emailAddress: "ivan@example.com" },
        duedate: "2026-08-14",
        labels: ["auth"],
        parent: { key: "PROJ-1", fields: { summary: "Эпик" } },
        sprint: { id: 9, name: "Sprint 9", state: "active", startDate: "2026-08-10" },
      },
    },
    "https://company.atlassian.net/"
  );

  assert.equal(summary.key, "PROJ-12");
  assert.equal(summary.url, "https://company.atlassian.net/browse/PROJ-12");
  assert.equal(summary.assignee.displayName, "Иван");
  assert.equal(summary.sprint.name, "Sprint 9");
  assert.equal(summary.parent.key, "PROJ-1");
});

test("берёт активный спринт из массива", () => {
  const summary = summarizeIssue({
    key: "PROJ-3",
    fields: {
      summary: "Задача",
      sprint: [
        { id: 1, name: "Old", state: "closed" },
        { id: 2, name: "Now", state: "active" },
      ],
    },
  });
  assert.equal(summary.sprint.name, "Now");
});

test("добавляет описание и последние комментарии", () => {
  const details = summarizeIssueDetails({
    key: "PROJ-12",
    fields: {
      summary: "Починить логин",
      description: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Сломан CSRF" }] },
        ],
      },
      comment: {
        comments: [
          {
            author: { displayName: "Анна" },
            created: "2026-08-12T10:00:00.000Z",
            body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Беру в работу" }] }] },
          },
        ],
      },
      subtasks: [
        { key: "PROJ-13", fields: { summary: "Тест", status: { name: "To Do" } } },
      ],
    },
  });
  assert.match(details.description, /Сломан CSRF/);
  assert.equal(details.comments[0].author, "Анна");
  assert.equal(details.subtasks[0].key, "PROJ-13");
});
