"use strict";

/**
 * Сжатие ответов Jira для контекста модели: без сырого ADF и лишних полей.
 */

function adfToText(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToText).join("");
  if (typeof node !== "object") return String(node);
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "mention") {
    return `@${node.attrs?.text || node.attrs?.id || "user"}`;
  }
  if (node.type === "emoji") return node.attrs?.shortName || node.attrs?.text || "";
  if (node.type === "inlineCard" || node.type === "blockCard") {
    return node.attrs?.url || "";
  }

  const inner = adfToText(node.content);
  switch (node.type) {
    case "paragraph":
    case "heading":
    case "blockquote":
    case "listItem":
      return inner ? `${inner}\n` : "";
    case "bulletList":
    case "orderedList":
    case "doc":
    case "panel":
    case "table":
    case "tableRow":
    case "tableCell":
    case "tableHeader":
      return inner;
    case "codeBlock":
      return inner ? `\`\`\`\n${inner}\n\`\`\`\n` : "";
    default:
      return inner;
  }
}

function truncate(text, max = 2000) {
  if (!text) return "";
  const trimmed = String(text).trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function person(user) {
  if (!user) return null;
  return {
    displayName: user.displayName || null,
    emailAddress: user.emailAddress || null,
    accountId: user.accountId || null,
  };
}

function extractSprint(fields) {
  const raw = fields?.sprint || fields?.closedSprints;
  if (!raw) return null;
  const items = Array.isArray(raw) ? raw : [raw];
  const active =
    items.find((item) => item && item.state === "active") || items[items.length - 1];
  if (!active || typeof active !== "object") return null;
  return {
    id: active.id,
    name: active.name,
    state: active.state,
    startDate: active.startDate || null,
    endDate: active.endDate || null,
  };
}

function summarizeIssue(issue, baseUrl) {
  const fields = issue.fields || {};
  const key = issue.key;
  const summary = {
    key,
    summary: fields.summary || null,
    type: fields.issuetype?.name || null,
    status: fields.status?.name || null,
    statusCategory: fields.status?.statusCategory?.name || null,
    priority: fields.priority?.name || null,
    assignee: person(fields.assignee),
    due: fields.duedate || null,
    updated: fields.updated || null,
    labels: fields.labels || [],
    parent: fields.parent
      ? {
          key: fields.parent.key,
          summary: fields.parent.fields?.summary || null,
        }
      : null,
    sprint: extractSprint(fields),
  };
  if (baseUrl && key) {
    summary.url = `${baseUrl.replace(/\/+$/, "")}/browse/${key}`;
  }
  return summary;
}

function summarizeIssueDetails(issue, baseUrl) {
  const fields = issue.fields || {};
  const summary = summarizeIssue(issue, baseUrl);
  const comments = (fields.comment?.comments || []).slice(-5).map((comment) => ({
    author: comment.author?.displayName || null,
    created: comment.created || null,
    body: truncate(adfToText(comment.body), 800),
  }));

  return {
    ...summary,
    reporter: person(fields.reporter),
    created: fields.created || null,
    components: (fields.components || []).map((item) => item.name).filter(Boolean),
    description: truncate(adfToText(fields.description), 2000),
    subtasks: (fields.subtasks || []).map((item) => ({
      key: item.key,
      summary: item.fields?.summary || null,
      status: item.fields?.status?.name || null,
    })),
    issuelinks: (fields.issuelinks || []).map((link) => {
      const linked = link.inwardIssue || link.outwardIssue;
      return {
        type: link.type?.inward && link.inwardIssue ? link.type.inward : link.type?.outward,
        key: linked?.key || null,
        summary: linked?.fields?.summary || null,
        status: linked?.fields?.status?.name || null,
      };
    }),
    comments,
  };
}

function summarizeSprint(sprint) {
  if (!sprint) return null;
  return {
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
    startDate: sprint.startDate || null,
    endDate: sprint.endDate || null,
    completeDate: sprint.completeDate || null,
    goal: sprint.goal || null,
    boardId: sprint.originBoardId || null,
  };
}

function summarizeBoard(board) {
  return {
    id: board.id,
    name: board.name,
    type: board.type,
    projectKey: board.location?.projectKey || null,
    projectName: board.location?.projectName || board.location?.displayName || null,
  };
}

module.exports = {
  adfToText,
  truncate,
  summarizeIssue,
  summarizeIssueDetails,
  summarizeSprint,
  summarizeBoard,
};
