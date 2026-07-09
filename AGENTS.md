# AGENTS.md

## Cursor Cloud specific instructions

This repo (`singularity-mcp-server`) is a Node.js project (Node >= 18; VM has v22) with three runnable
entry points and no build/lint/test tooling. Dependencies are installed by the startup update script
(`npm install`), so future agents can assume `node_modules/` is present.

### Services / entry points (all scripts are in `package.json`)

| Service | Command | Notes |
| --- | --- | --- |
| MCP server (core product) | `npm start` (`node mcp.js`) | stdio JSON-RPC server exposing 56 Singularity tools. Not an HTTP server — connect an MCP client to test (e.g. reuse `bot/mcp-client.js`). |
| HTTP server | `npm run http-server` | Express server; `GET /health` works with no credentials (auto `DEMO_MODE` when `REFRESH_TOKEN` unset). See gotcha below about `/mcp`. |
| Telegram bot (user-facing app) | `npm run bot` (`node bot/index.js`) | Requires external secrets in `.env`; long-polls Telegram + calls OpenAI. |

### Non-obvious gotchas

- No build step: the `.js` files are pre-compiled from TypeScript (note the `//# sourceMappingURL` footers)
  and committed directly. There is no `tsc`/`dist` step and no `.ts` sources — run the `.js` files as-is.
- No lint or test scripts exist (`package.json` has only `start`, `mcp`, `http-server`, `bot`).
- The MCP server ships a hard-coded default `accessToken` in `mcp.js` / `bot/config.js` that is **expired**.
  With it, tool calls reach the live API `https://api.singularity-app.com` but return HTTP 401
  (`SINGULARITY_NOT_FOUND`). Set a valid `SINGULARITY_ACCESS_TOKEN` (bot) or pass `--accessToken` (mcp.js)
  to perform authenticated CRUD (create project/task/note/habit, etc.).
- HTTP server `POST /mcp` is a stubbed mock that throws `this._transport.start is not a function`
  (`MockStreamableHTTPServerTransport` does not implement the SDK transport interface). This is a
  pre-existing repo limitation; only `GET /health` is functional there.
- The Telegram bot requires `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, and `ALLOWED_USER_IDS` (owner Telegram
  user IDs, comma-separated); `SINGULARITY_ACCESS_TOKEN` is needed for real task/project operations.
  Missing vars fail fast at startup via the guard in `bot/config.js`. The bot spawns `mcp.js` as a child
  process over stdio.
- Config is loaded with `dotenv` (`bot/config.js`), which reads a local `.env` but does **not** override
  vars already present in `process.env`. In cloud VMs the secrets are injected as env vars, so the bot
  reads them directly. If you launch the bot from a detached/login shell (e.g. a fresh `tmux` session)
  that does not inherit those injected vars, create a local `.env` (copy `.env.example`, it is gitignored).
- The bot long-polls Telegram; only one process may poll a given bot token at a time (a second one gets a
  Telegram 409 conflict). The per-message pipeline is `bot/agent.js` `runAgent` (OpenAI function-calling ->
  MCP tool call -> Singularity API) — it can be exercised directly without the Telegram transport.
