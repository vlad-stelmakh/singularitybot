"use strict";

/**
 * Разбор конфигурации Jira MCP из env и аргументов командной строки.
 * Без URL, email и токена интеграция считается выключенной.
 */

function normalizeJiraBaseUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  let url = raw.trim().replace(/\/+$/, "");
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

function parseJiraConfig(env = process.env) {
  const rawUrl = env.JIRA_BASE_URL || env.JIRA_HOST || env.JIRA_URL || "";
  const email = (env.JIRA_EMAIL || env.JIRA_USERNAME || "").trim();
  const apiToken = (env.JIRA_API_TOKEN || "").trim();
  const projectKey = (env.JIRA_PROJECT_KEY || "").trim() || undefined;
  const boardId = (env.JIRA_BOARD_ID || "").trim() || undefined;
  const entryPoint = (env.JIRA_MCP_ENTRY_POINT || "").trim() || undefined;

  const hasAny = Boolean(rawUrl || email || apiToken || projectKey || boardId);
  if (!hasAny) {
    return { enabled: false };
  }

  const missing = [];
  if (!String(rawUrl).trim()) missing.push("JIRA_BASE_URL");
  if (!email) missing.push("JIRA_EMAIL");
  if (!apiToken) missing.push("JIRA_API_TOKEN");
  if (missing.length) {
    return { enabled: false, incomplete: true, missing };
  }

  return {
    enabled: true,
    incomplete: false,
    baseUrl: normalizeJiraBaseUrl(rawUrl),
    email,
    apiToken,
    projectKey,
    boardId,
    entryPoint,
  };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    const take = () => {
      i += 1;
      return next;
    };
    if (arg === "--baseUrl" || arg === "-u") parsed.baseUrl = take();
    else if (arg === "--email" || arg === "-e") parsed.email = take();
    else if (arg === "--apiToken" || arg === "-t") parsed.apiToken = take();
    else if (arg === "--projectKey" || arg === "-p") parsed.projectKey = take();
    else if (arg === "--boardId" || arg === "-b") parsed.boardId = take();
    else if (arg === "--noLog" || arg === "-n") parsed.noLog = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
  }
  return parsed;
}

function resolveJiraRuntimeConfig({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const fromEnv = parseJiraConfig(env);
  const cli = parseCliArgs(argv);
  if (cli.help) return { help: true };

  const merged = {
    baseUrl: cli.baseUrl || fromEnv.baseUrl,
    email: cli.email || fromEnv.email,
    apiToken: cli.apiToken || fromEnv.apiToken,
    projectKey: cli.projectKey || fromEnv.projectKey,
    boardId: cli.boardId || fromEnv.boardId,
    enableLogging: !cli.noLog,
  };

  const missing = [];
  if (!merged.baseUrl) missing.push("--baseUrl / JIRA_BASE_URL");
  if (!merged.email) missing.push("--email / JIRA_EMAIL");
  if (!merged.apiToken) missing.push("--apiToken / JIRA_API_TOKEN");
  if (missing.length) {
    return { error: `Не заданы параметры Jira: ${missing.join(", ")}.` };
  }

  merged.baseUrl = normalizeJiraBaseUrl(merged.baseUrl);
  return merged;
}

function buildJiraMcpArgs({
  entryPoint,
  baseUrl,
  email,
  apiToken,
  projectKey,
  boardId,
}) {
  const args = [
    entryPoint,
    "--baseUrl",
    baseUrl,
    "--email",
    email,
    "--apiToken",
    apiToken,
    "-n",
  ];
  if (projectKey) args.push("--projectKey", projectKey);
  if (boardId) args.push("--boardId", String(boardId));
  return args;
}

const HELP_TEXT = `
Запуск MCP-сервера Jira (только чтение)

Использование:
  node jira-mcp.js [опции]

Опции:
  --baseUrl, -u       URL Jira Cloud, например https://company.atlassian.net
  --email, -e         Email аккаунта Atlassian
  --apiToken, -t      API-токен (https://id.atlassian.com/manage-profile/security/api-tokens)
  --projectKey, -p    Ключ проекта по умолчанию (необязательно)
  --boardId, -b       ID Scrum/Kanban доски по умолчанию (необязательно)
  --noLog, -n         Не писать логи в stderr
  --help, -h          Справка

Параметры также читаются из переменных окружения JIRA_BASE_URL, JIRA_EMAIL,
JIRA_API_TOKEN, JIRA_PROJECT_KEY, JIRA_BOARD_ID.
`.trim();

module.exports = {
  normalizeJiraBaseUrl,
  parseJiraConfig,
  parseCliArgs,
  resolveJiraRuntimeConfig,
  buildJiraMcpArgs,
  HELP_TEXT,
};
