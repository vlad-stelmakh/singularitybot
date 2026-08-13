"use strict";

const axios = require("axios");
const { normalizeJiraBaseUrl } = require("./config");
const {
  summarizeIssue,
  summarizeIssueDetails,
  summarizeSprint,
  summarizeBoard,
} = require("./format");

const DEFAULT_SEARCH_FIELDS = [
  "summary",
  "status",
  "priority",
  "assignee",
  "issuetype",
  "duedate",
  "updated",
  "created",
  "parent",
  "labels",
  "sprint",
];

const ISSUE_DETAIL_FIELDS = [
  ...DEFAULT_SEARCH_FIELDS,
  "reporter",
  "description",
  "comment",
  "components",
  "issuelinks",
  "subtasks",
];

function getJiraErrorMessage(err) {
  const data = err && err.response && err.response.data;
  if (!data) return err instanceof Error ? err.message : String(err);
  const parts = [];
  if (Array.isArray(data.errorMessages)) parts.push(...data.errorMessages);
  if (data.errors && typeof data.errors === "object") {
    for (const [field, message] of Object.entries(data.errors)) {
      parts.push(`${field}: ${message}`);
    }
  }
  if (typeof data === "string" && data.trim()) parts.push(data);
  if (typeof data.message === "string") parts.push(data.message);
  return parts.filter(Boolean).join("; ") || (err instanceof Error ? err.message : String(err));
}

class JiraClient {
  /**
   * @param {object} options
   * @param {string} options.baseUrl
   * @param {string} options.email
   * @param {string} options.apiToken
   * @param {string} [options.projectKey]
   * @param {string} [options.boardId]
   * @param {import('axios').AxiosInstance} [options.http]
   */
  constructor({ baseUrl, email, apiToken, projectKey, boardId, http }) {
    this.baseUrl = normalizeJiraBaseUrl(baseUrl);
    this.projectKey = projectKey || undefined;
    this.boardId = boardId ? String(boardId) : undefined;
    this.http =
      http ||
      axios.create({
        baseURL: this.baseUrl,
        auth: { username: email, password: apiToken },
        headers: { Accept: "application/json" },
        timeout: 30000,
      });
  }

  async request(method, url, { params, data } = {}) {
    try {
      const response = await this.http.request({ method, url, params, data });
      return response.data;
    } catch (err) {
      const wrapped = new Error(getJiraErrorMessage(err));
      wrapped.cause = err;
      throw wrapped;
    }
  }

  async getMyself() {
    const data = await this.request("GET", "/rest/api/3/myself");
    return {
      accountId: data.accountId,
      displayName: data.displayName,
      emailAddress: data.emailAddress,
      timeZone: data.timeZone,
      locale: data.locale,
    };
  }

  async search({ jql, maxResults = 50, nextPageToken, fields } = {}) {
    if (!jql || !String(jql).trim()) {
      throw new Error("Нужен JQL-запрос.");
    }
    const fieldList = fields && fields.length ? fields : DEFAULT_SEARCH_FIELDS;
    const body = {
      jql: String(jql).trim(),
      maxResults: Number(maxResults) || 50,
      fields: fieldList,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    let data;
    try {
      data = await this.request("POST", "/rest/api/3/search/jql", { data: body });
    } catch (err) {
      const status = err.cause && err.cause.response && err.cause.response.status;
      if (status !== 404 && status !== 410) throw err;
      data = await this.request("GET", "/rest/api/3/search", {
        params: {
          jql: body.jql,
          maxResults: body.maxResults,
          fields: fieldList.join(","),
        },
      });
    }

    return {
      jql: body.jql,
      total: data.total,
      nextPageToken: data.nextPageToken || null,
      isLast: data.isLast,
      issues: (data.issues || []).map((issue) => summarizeIssue(issue, this.baseUrl)),
    };
  }

  async getIssue(issueKey) {
    if (!issueKey) throw new Error("Нужен ключ задачи, например PROJ-123.");
    const data = await this.request("GET", `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      params: { fields: ISSUE_DETAIL_FIELDS.join(",") },
    });

    try {
      const agile = await this.request(
        "GET",
        `/rest/agile/1.0/issue/${encodeURIComponent(issueKey)}`
      );
      if (agile && agile.fields && agile.fields.sprint) {
        data.fields = data.fields || {};
        data.fields.sprint = agile.fields.sprint;
      }
    } catch (_) {
      /* Agile API может быть недоступен — описание задачи всё равно полезно. */
    }

    return summarizeIssueDetails(data, this.baseUrl);
  }

  async listBoards({ projectKeyOrId, name, maxResults = 50 } = {}) {
    const params = { maxResults: Number(maxResults) || 50 };
    const project = projectKeyOrId || this.projectKey;
    if (project) params.projectKeyOrId = project;
    if (name) params.name = name;
    const data = await this.request("GET", "/rest/agile/1.0/board", { params });
    return {
      isLast: data.isLast,
      maxResults: data.maxResults,
      startAt: data.startAt,
      total: data.total,
      boards: (data.values || []).map(summarizeBoard),
    };
  }

  async getSprints({ boardId, state = "active", maxResults = 50 } = {}) {
    const id = boardId || this.boardId;
    if (!id) {
      throw new Error(
        "Не задан boardId. Укажите его в вызове или задайте JIRA_BOARD_ID, либо сначала вызовите jira_list_boards."
      );
    }
    const params = { maxResults: Number(maxResults) || 50 };
    if (state) params.state = state;
    const data = await this.request(
      "GET",
      `/rest/agile/1.0/board/${encodeURIComponent(id)}/sprint`,
      { params }
    );
    return {
      boardId: String(id),
      isLast: data.isLast,
      sprints: (data.values || []).map(summarizeSprint),
    };
  }

  async getSprintIssues({ sprintId, jql, maxResults = 50, startAt = 0 } = {}) {
    if (!sprintId) throw new Error("Нужен sprintId.");
    const params = {
      maxResults: Number(maxResults) || 50,
      startAt: Number(startAt) || 0,
      fields: DEFAULT_SEARCH_FIELDS.join(","),
    };
    if (jql) params.jql = jql;
    const data = await this.request(
      "GET",
      `/rest/agile/1.0/sprint/${encodeURIComponent(sprintId)}/issue`,
      { params }
    );
    return {
      sprintId: String(sprintId),
      total: data.total,
      issues: (data.issues || []).map((issue) => summarizeIssue(issue, this.baseUrl)),
    };
  }

  buildMySprintJql({ mineOnly = true, includeDone = false } = {}) {
    const clauses = ["sprint in openSprints()"];
    if (this.projectKey) clauses.push(`project = ${this.projectKey}`);
    if (mineOnly) clauses.push("assignee = currentUser()");
    if (!includeDone) clauses.push("statusCategory != Done");
    return `${clauses.join(" AND ")} ORDER BY priority DESC, updated DESC`;
  }

  async mySprint({ mineOnly = true, includeDone = false, maxResults = 50 } = {}) {
    const jql = this.buildMySprintJql({ mineOnly, includeDone });
    const search = await this.search({ jql, maxResults });

    let sprint = null;
    if (this.boardId) {
      try {
        const listed = await this.getSprints({ boardId: this.boardId, state: "active" });
        sprint = (listed.sprints || [])[0] || null;
      } catch (_) {
        /* доска необязательна: задачи уже получены через JQL */
      }
    }
    if (!sprint) {
      sprint = (search.issues || []).map((issue) => issue.sprint).find(Boolean) || null;
    }

    return {
      sprint,
      jql,
      mineOnly: Boolean(mineOnly),
      includeDone: Boolean(includeDone),
      total: search.total,
      nextPageToken: search.nextPageToken,
      issues: search.issues,
    };
  }
}

module.exports = {
  JiraClient,
  getJiraErrorMessage,
  DEFAULT_SEARCH_FIELDS,
};
