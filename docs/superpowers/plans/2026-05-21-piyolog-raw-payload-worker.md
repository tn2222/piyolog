# Piyolog Raw Payload Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Workers TypeScript API that receives Piyolog custom action JSON and stores the raw payload in TiDB Cloud Serverless.

**Architecture:** Keep the Worker thin: `src/index.ts` handles HTTP routing, `src/handler.ts` validates requests and formats responses, and `src/repository.ts` persists raw payloads. The first release does not normalize Piyolog events; it only captures real JSON for later schema design.

**Tech Stack:** TypeScript, Cloudflare Workers, Wrangler, Vitest, `@tidbcloud/serverless`, TiDB Cloud Serverless.

---

## File Structure

- Create: `package.json` for scripts and dependencies.
- Create: `tsconfig.json` for strict TypeScript.
- Create: `wrangler.jsonc` for Cloudflare Workers configuration.
- Create: `.dev.vars.example` for local environment variable names.
- Create: `migrations/001_create_raw_piyolog_payloads.sql` for the TiDB table.
- Create: `src/types.ts` for environment and repository interfaces.
- Create: `src/repository.ts` for TiDB insert behavior.
- Create: `src/handler.ts` for request validation and response behavior.
- Create: `src/index.ts` for Worker entrypoint and dependency wiring.
- Create: `test/handler.test.ts` for API behavior tests.
- Create: `test/repository.test.ts` for SQL/repository behavior tests.
- Modify: `docs/decisions/2026-05-21-capture-piyolog-raw-payloads.md` only if implementation facts diverge from the ADR.

## Task 1: Scaffold TypeScript Worker Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.jsonc`
- Create: `.dev.vars.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "piyolog-grafana-ingestion",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tidbcloud/serverless": "^0.3.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260516.0",
    "typescript": "^5.8.3",
    "vitest": "^3.1.4",
    "wrangler": "^4.15.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "WebWorker"],
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "piyolog-grafana-ingestion",
  "main": "src/index.ts",
  "compatibility_date": "2026-05-21",
  "observability": {
    "enabled": true
  }
}
```

- [ ] **Step 4: Create `.dev.vars.example`**

```dotenv
INGEST_TOKEN=replace-with-a-long-random-token
DATABASE_URL=mysql://user:password@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/test?sslaccept=strict
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and dependencies install without errors.

- [ ] **Step 6: Run initial checks**

Run: `npm run typecheck`

Expected: FAIL because `src/index.ts` does not exist yet.

## Task 2: Define Shared Types and Repository Contract

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
export type Env = {
  INGEST_TOKEN: string;
  DATABASE_URL: string;
};

export type RawPayloadInput = {
  sourceIp: string | null;
  userAgent: string | null;
  payload: unknown;
};

export type RawPayloadInsertResult = {
  id: number | null;
};

export type RawPayloadRepository = {
  insert(input: RawPayloadInput): Promise<RawPayloadInsertResult>;
};
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: FAIL because the Worker entrypoint is still missing, but `src/types.ts` has no type errors.

## Task 3: Test and Implement Request Handler

**Files:**
- Create: `src/handler.ts`
- Create: `test/handler.test.ts`

- [ ] **Step 1: Write failing handler tests in `test/handler.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { handleRecordsRequest } from "../src/handler";
import type { RawPayloadInput, RawPayloadRepository } from "../src/types";

class MemoryRepository implements RawPayloadRepository {
  public inserted: RawPayloadInput[] = [];

  async insert(input: RawPayloadInput) {
    this.inserted.push(input);
    return { id: 123 };
  }
}

const env = {
  INGEST_TOKEN: "secret-token",
  DATABASE_URL: "mysql://example",
};

describe("handleRecordsRequest", () => {
  it("rejects non-POST requests", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "GET",
    });

    const response = await handleRecordsRequest(request, env, repository);

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ ok: false, error: "method_not_allowed" });
    expect(repository.inserted).toHaveLength(0);
  });

  it("rejects missing token", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records", {
      method: "POST",
      body: "{}",
    });

    const response = await handleRecordsRequest(request, env, repository);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(repository.inserted).toHaveLength(0);
  });

  it("rejects invalid token", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=wrong", {
      method: "POST",
      body: "{}",
    });

    const response = await handleRecordsRequest(request, env, repository);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(repository.inserted).toHaveLength(0);
  });

  it("rejects invalid JSON", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "POST",
      body: "{not-json",
    });

    const response = await handleRecordsRequest(request, env, repository);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_json" });
    expect(repository.inserted).toHaveLength(0);
  });

  it("saves valid JSON with request metadata", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
        "user-agent": "Piyolog Custom Action",
      },
      body: JSON.stringify({ records: [{ type: "milk", amount: 50 }] }),
    });

    const response = await handleRecordsRequest(request, env, repository);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 123 });
    expect(repository.inserted).toEqual([
      {
        sourceIp: "203.0.113.10",
        userAgent: "Piyolog Custom Action",
        payload: { records: [{ type: "milk", amount: 50 }] },
      },
    ]);
  });

  it("returns 500 when persistence fails", async () => {
    const repository: RawPayloadRepository = {
      async insert() {
        throw new Error("database unavailable");
      },
    };
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "POST",
      body: JSON.stringify({ records: [] }),
    });

    const response = await handleRecordsRequest(request, env, repository);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "internal_error" });
  });
});
```

- [ ] **Step 2: Run handler tests to verify failure**

Run: `npm test -- test/handler.test.ts`

Expected: FAIL with an import error for `../src/handler`.

- [ ] **Step 3: Implement `src/handler.ts`**

```ts
import type { Env, RawPayloadRepository } from "./types";

type ErrorCode =
  | "method_not_allowed"
  | "unauthorized"
  | "invalid_json"
  | "internal_error";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function handleRecordsRequest(
  request: Request,
  env: Env,
  repository: RawPayloadRepository,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" satisfies ErrorCode }, 405);
  }

  const url = new URL(request.url);
  if (url.searchParams.get("token") !== env.INGEST_TOKEN) {
    return jsonResponse({ ok: false, error: "unauthorized" satisfies ErrorCode }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" satisfies ErrorCode }, 400);
  }

  try {
    const result = await repository.insert({
      sourceIp: request.headers.get("cf-connecting-ip"),
      userAgent: request.headers.get("user-agent"),
      payload,
    });

    return jsonResponse({ ok: true, id: result.id }, 200);
  } catch (error) {
    console.error("Failed to insert Piyolog raw payload", error);
    return jsonResponse({ ok: false, error: "internal_error" satisfies ErrorCode }, 500);
  }
}
```

- [ ] **Step 4: Run handler tests to verify pass**

Run: `npm test -- test/handler.test.ts`

Expected: PASS.

## Task 4: Test and Implement TiDB Repository

**Files:**
- Create: `src/repository.ts`
- Create: `test/repository.test.ts`

- [ ] **Step 1: Write repository tests in `test/repository.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { TiDBRawPayloadRepository } from "../src/repository";

type QueryCall = {
  sql: string;
  params: unknown[];
};

class FakeConnection {
  public calls: QueryCall[] = [];

  async execute(sql: string, params: unknown[]) {
    this.calls.push({ sql, params });
    return {
      lastInsertId: "42",
    };
  }
}

describe("TiDBRawPayloadRepository", () => {
  it("inserts raw payload JSON and metadata", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBRawPayloadRepository(connection);

    const result = await repository.insert({
      sourceIp: "203.0.113.10",
      userAgent: "Piyolog Custom Action",
      payload: { records: [{ type: "milk", amount: 50 }] },
    });

    expect(result).toEqual({ id: 42 });
    expect(connection.calls).toEqual([
      {
        sql: `
INSERT INTO raw_piyolog_payloads (source_ip, user_agent, payload_json)
VALUES (?, ?, CAST(? AS JSON))
        `.trim(),
        params: [
          "203.0.113.10",
          "Piyolog Custom Action",
          JSON.stringify({ records: [{ type: "milk", amount: 50 }] }),
        ],
      },
    ]);
  });

  it("returns null id when the driver does not expose lastInsertId", async () => {
    const connection = {
      async execute() {
        return {};
      },
    };
    const repository = new TiDBRawPayloadRepository(connection);

    const result = await repository.insert({
      sourceIp: null,
      userAgent: null,
      payload: { ok: true },
    });

    expect(result).toEqual({ id: null });
  });
});
```

- [ ] **Step 2: Run repository tests to verify failure**

Run: `npm test -- test/repository.test.ts`

Expected: FAIL with an import error for `../src/repository`.

- [ ] **Step 3: Implement `src/repository.ts`**

```ts
import { connect } from "@tidbcloud/serverless";
import type { RawPayloadInput, RawPayloadRepository } from "./types";

type TiDBConnection = {
  execute(sql: string, params?: unknown[]): Promise<{
    lastInsertId?: string | number;
  }>;
};

export class TiDBRawPayloadRepository implements RawPayloadRepository {
  constructor(private readonly connection: TiDBConnection) {}

  async insert(input: RawPayloadInput) {
    const result = await this.connection.execute(
      `
INSERT INTO raw_piyolog_payloads (source_ip, user_agent, payload_json)
VALUES (?, ?, CAST(? AS JSON))
      `.trim(),
      [input.sourceIp, input.userAgent, JSON.stringify(input.payload)],
    );

    return {
      id: result.lastInsertId == null ? null : Number(result.lastInsertId),
    };
  }
}

export function createTiDBRawPayloadRepository(databaseUrl: string): RawPayloadRepository {
  return new TiDBRawPayloadRepository(connect({ url: databaseUrl }) as TiDBConnection);
}
```

- [ ] **Step 4: Run repository tests to verify pass**

Run: `npm test -- test/repository.test.ts`

Expected: PASS.

## Task 5: Implement Worker Entrypoint

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create `src/index.ts`**

```ts
import { handleRecordsRequest } from "./handler";
import { createTiDBRawPayloadRepository } from "./repository";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/api/records") {
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
        status: 404,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      });
    }

    const repository = createTiDBRawPayloadRepository(env.DATABASE_URL);
    return handleRecordsRequest(request, env, repository);
  },
};
```

- [ ] **Step 2: Run all local checks**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

## Task 6: Add TiDB Migration

**Files:**
- Create: `migrations/001_create_raw_piyolog_payloads.sql`

- [ ] **Step 1: Create migration SQL**

```sql
CREATE TABLE IF NOT EXISTS raw_piyolog_payloads (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_ip VARCHAR(64),
  user_agent TEXT,
  payload_json JSON NOT NULL
);
```

- [ ] **Step 2: Apply the migration manually in TiDB Cloud**

Run this SQL in the TiDB Cloud SQL console connected to the target database.

Expected: `raw_piyolog_payloads` exists with the five columns above.

## Task 7: Document Local and Cloud Setup

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```md
# Piyolog Grafana Ingestion

Captures raw Piyolog custom action JSON in TiDB Cloud Serverless so the real payload can drive later Grafana schema design.

## Stack

- Cloudflare Workers
- TypeScript
- TiDB Cloud Serverless
- Grafana Cloud

## Environment

Create `.dev.vars` locally:

```dotenv
INGEST_TOKEN=replace-with-a-long-random-token
DATABASE_URL=mysql://user:password@host:4000/database?sslaccept=strict
```

Set production secrets in Cloudflare:

```bash
npx wrangler secret put INGEST_TOKEN
npx wrangler secret put DATABASE_URL
```

## Database

Apply:

```sql
CREATE TABLE IF NOT EXISTS raw_piyolog_payloads (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_ip VARCHAR(64),
  user_agent TEXT,
  payload_json JSON NOT NULL
);
```

## Local Development

```bash
npm install
npm test
npm run typecheck
npm run dev
```

## Manual Request Test

```bash
curl -i \
  -X POST \
  "http://localhost:8787/api/records?token=$INGEST_TOKEN" \
  -H "content-type: application/json" \
  --data '{"records":[{"type":"milk","amount":50}]}'
```

Expected response:

```json
{"ok":true,"id":1}
```

## Deploy

```bash
npm run deploy
```

Configure the Piyolog custom action URL:

```text
https://your-worker-url.example/api/records?token=your-shared-token
```
```

- [ ] **Step 2: Run documentation-adjacent checks**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

## Task 8: Manual Verification

**Files:**
- No file changes.

- [ ] **Step 1: Start local Worker**

Run: `npm run dev`

Expected: Wrangler starts a local Worker at `http://localhost:8787`.

- [ ] **Step 2: Send invalid token request**

Run:

```bash
curl -i \
  -X POST \
  "http://localhost:8787/api/records?token=wrong" \
  -H "content-type: application/json" \
  --data '{"records":[]}'
```

Expected: HTTP `401` and body `{"ok":false,"error":"unauthorized"}`.

- [ ] **Step 3: Send invalid JSON request**

Run:

```bash
curl -i \
  -X POST \
  "http://localhost:8787/api/records?token=$INGEST_TOKEN" \
  -H "content-type: application/json" \
  --data '{not-json'
```

Expected: HTTP `400` and body `{"ok":false,"error":"invalid_json"}`.

- [ ] **Step 4: Send valid JSON request**

Run:

```bash
curl -i \
  -X POST \
  "http://localhost:8787/api/records?token=$INGEST_TOKEN" \
  -H "content-type: application/json" \
  --data '{"records":[{"type":"milk","amount":50}]}'
```

Expected: HTTP `200` and body shaped like `{"ok":true,"id":1}`.

- [ ] **Step 5: Confirm TiDB row**

Run in TiDB Cloud SQL console:

```sql
SELECT id, received_at, source_ip, user_agent, payload_json
FROM raw_piyolog_payloads
ORDER BY id DESC
LIMIT 5;
```

Expected: the valid test payload appears in `payload_json`.

## Self-Review

- Spec coverage: Covers public POST endpoint, token authentication, JSON validation, raw TiDB persistence, metadata capture, errors, and manual Piyolog readiness.
- Placeholder scan: No `TBD`, `TODO`, or undefined implementation placeholders.
- Type consistency: `Env`, `RawPayloadRepository`, `RawPayloadInput`, and `RawPayloadInsertResult` are defined before use and used consistently.

