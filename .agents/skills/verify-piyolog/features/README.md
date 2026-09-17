# piyolog verification map

This directory is the maintained source for verifying the user-facing behavior of the piyolog Worker. Read the index before driving the app, start a disposable local Worker, run Doctor, and then use one feature recipe.

## Baseline preconditions

- Run `npm install` and confirm `npm run typecheck` and `npm test` pass before a verification session.
- Launch the Worker with the `Launch` section in the parent skill and keep `SERVER_PID`, `PORT`, `BASE_URL`, and `ARTIFACT_DIR` in the same shell.
- Run the parent skill's `Doctor` section before any feature recipe.
- Use a free loopback port. Set `PIYOLOG_VERIFY_PORT` when another local process owns 8788.
- Use a disposable TiDB database for mutation recipes. Never point a verification request at production data.
- Keep evidence under `ARTIFACT_DIR`; do not commit it.

## Driving conventions

- Run every recipe from the baseline state unless its preconditions say otherwise.
- Pair each user action with its exact `curl` command and the observable response.
- Treat `200` with an error-shaped body as a failed feature; assert both status and JSON fields.
- For routes requiring secrets or external services, report the unmet precondition instead of claiming local verification.
- Clean up the Worker after every run and keep the evidence directory.

## Features

- [MCP connectivity](./mcp-ping.md) covers the unauthenticated `ping_piyolog` tool.
- [MCP log reading](./mcp-read-logs.md) covers the token-protected `get_recent_baby_logs` tool.
- [Text export ingestion](./text-export-ingestion.md) covers `POST /api/text-records` and its database side effect.
- [Diary capture](./diary-capture.md) covers `POST /api/custom-action-captures` and its database side effect.
- [Public feed refresh](./piyolog-feed-refresh.md) covers the scheduled feed sync and its database projection.
- [Slack slash command](./slack-command.md) covers `POST /api/slack/commands`.
- [LINE webhook](./line-webhook.md) covers signed `POST /api/line/webhook`.
