# Repository Guidelines

## Project Structure & Module Organization

This repository contains a TypeScript Cloudflare Worker that ingests Piyolog text exports and stores normalized events in TiDB Cloud Serverless. Worker source lives in `src/`: `index.ts` routes requests, `handler.ts` validates and processes API input, `piyologText.ts` parses exports, and `repository.ts` handles persistence. Tests live in `test/` and mirror the source modules. Database DDL is kept in `migrations/`. Google Apps Script integration code and setup notes live in `apps-script/`. Local Mac formula reminder utilities are in `scripts/`.

## Build, Test, and Development Commands

- `npm install`: install Node dependencies. Use Node 22 or newer (`.node-version` is present).
- `npm run dev`: start the Worker locally with Wrangler.
- `npm test`: run the Vitest suite once.
- `npm run typecheck`: run TypeScript with `tsc --noEmit`.
- `npm run deploy`: deploy the Worker with Wrangler.
- `npm run notify:formula -- --dry-run`: test formula reminder logic without sending a notification.

## Coding Style & Naming Conventions

Use TypeScript ES modules with strict typing. Keep imports explicit and prefer named exports for testable helpers. Match the existing style: two-space indentation, double quotes, trailing commas in multiline calls and objects, and concise pure functions where possible. Use `camelCase` for variables/functions, `PascalCase` for types, and descriptive filenames such as `piyologText.ts` or `repository.test.ts`.

## Testing Guidelines

Vitest is the test framework. Place tests in `test/` with `*.test.ts` filenames and use `describe`/`it` blocks with behavior-focused names, for example `it("extracts every timestamped row as a Japanese event", ...)`. Add or update tests when changing parsing behavior, request validation, repository contracts, or Worker responses. Run `npm test` and `npm run typecheck` before handing off changes.

## Commit & Pull Request Guidelines

Recent history uses short imperative messages, sometimes with Conventional Commit prefixes such as `feat:` and `fix:`. Keep commits focused, for example `feat: normalize piyolog events` or `fix: replace normalized events by date`. Pull requests should include a brief summary, linked issue if applicable, test results, and any deployment, migration, or configuration notes. Include screenshots only for Apps Script or Grafana-facing UI changes.

## Security & Configuration Tips

Do not commit secrets. Use `.dev.vars` for local Worker secrets and `.env` for local notifier settings; keep `.dev.vars.example` as the template. Production secrets should be set with `npx wrangler secret put INGEST_TOKEN` and `npx wrangler secret put DATABASE_URL`.
