---
name: verify-piyolog
description: "Verify the piyolog Cloudflare Worker HTTP API locally with Wrangler and curl; use when proving API routes, MCP connectivity, or database-backed ingestion behavior."
---

# Verify piyolog

The primary user surface is the Cloudflare Worker HTTP API. The repository also contains a Google Apps Script sender and a macOS milk notifier; those secondary processes are documented in repository docs but are not started by this skill.

## Launch

Run from the repository root. Use one shell for launch, drive, and cleanup so `SERVER_PID` remains the exact process started by this run.

```sh
set -u
umask 077
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
PORT="${PIYOLOG_VERIFY_PORT:-8788}"
ARTIFACT_DIR="${PIYOLOG_VERIFY_ARTIFACT_ROOT:-$PWD/artifacts/verify-piyolog}/$RUN_ID"
BASE_URL="http://127.0.0.1:$PORT"
mkdir -p "$ARTIFACT_DIR"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $PORT is already in use; choose PIYOLOG_VERIFY_PORT" >&2
  exit 1
fi

npm run dev -- --local --port "$PORT" --inspector-port 0 --log-level none --show-interactive-dev-session=false >"$ARTIFACT_DIR/server.log" 2>&1 &
SERVER_PID=$!
printf '%s\n' "$SERVER_PID" >"$ARTIFACT_DIR/server.pid"
printf '%s\n' "$PORT" >"$ARTIFACT_DIR/server.port"

status=000
for attempt in $(seq 1 30); do
  status="$(curl -sS -o "$ARTIFACT_DIR/readiness.body" -w '%{http_code}' "$BASE_URL/" 2>"$ARTIFACT_DIR/readiness.error")" || status=000
  if [ "$status" = 404 ]; then
    break
  fi
  sleep 1
done
test "$status" = 404
```

Wrangler is ready when `GET $BASE_URL/` returns `404` with `{"ok":false,"error":"not_found"}`. The `--inspector-port 0` option avoids opening a fixed debug port. A database is not needed for the isolated MCP ping feature; database-backed routes require a local `.dev.vars` with a disposable TiDB database and the required secrets before launch.

## Doctor

Run this after launch and before driving a feature. It is read-only and refuses to drive a different process or an occupied port.

```sh
test -n "${SERVER_PID:-}"
kill -0 "$SERVER_PID"
ps -p "$SERVER_PID" -o command= | rg -q 'npm run dev|wrangler dev'

lsof -nP -iTCP:"$PORT" -sTCP:LISTEN | tee "$ARTIFACT_DIR/doctor.listener.txt" | rg -q 'workerd|cworkerd'

status="$(curl -sS -o "$ARTIFACT_DIR/doctor.root.json" -w '%{http_code}' "$BASE_URL/")"
test "$status" = 404

printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' >"$ARTIFACT_DIR/doctor.request.json"
status="$(curl -sS -o "$ARTIFACT_DIR/doctor.mcp.json" -w '%{http_code}' \
  -H 'content-type: application/json' \
  --data-binary @"$ARTIFACT_DIR/doctor.request.json" \
  "$BASE_URL/mcp")"
test "$status" = 200
node --input-type=module -e '
import { readFileSync } from "node:fs";
const body = JSON.parse(readFileSync(process.argv[1], "utf8"));
if (body.result?.tools?.length !== 1 || body.result.tools[0]?.name !== "ping_piyolog") process.exit(1);
' "$ARTIFACT_DIR/doctor.mcp.json"
```

This checks the running process, the port listener, the route response, and the expected local build surface. `ping_piyolog` is deliberately available without authentication and does not contact TiDB or the LLM gateway.

## Drive

Read `features/README.md`, then drive one feature from its file. Use `curl` for HTTP actions. Keep the request body, response headers, response body, and assertion output in `ARTIFACT_DIR`. Do not call private functions or test-only endpoints.

## Evidence

Proof must contain the user action and resulting state. For HTTP features, retain the exact request JSON or form body, response headers, response body, HTTP status, and a machine-readable assertion result. For database-backed features, run a read-only SQL query against the disposable database after the HTTP response and retain its output beside the response. Do not use production data for verification.

The artifact directory is `$ARTIFACT_DIR` unless `PIYOLOG_VERIFY_ARTIFACT_ROOT` is set. It is created with mode `700` and may contain family data or credentials. Never commit it, paste it into a public issue, or include feed URLs and tokens in evidence. Screenshots are not useful for this API surface.

## Cleanup

Run cleanup in the launch shell after every drive, including failed drives. Kill only the PID captured in `SERVER_PID`; never kill by process name. Leave the artifact directory in place.

```sh
if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
  kill "$SERVER_PID"
  wait "$SERVER_PID" 2>/dev/null || true
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "verification port $PORT is still occupied; inspect the listener before another run" >&2
  exit 1
fi

test -s "$ARTIFACT_DIR/mcp-ping.response.json" || true
```

The final `test` is informational: an MCP ping artifact exists only when that feature was driven. Cleanup must not remove any artifact or scratch evidence.

## Helpers

This skill ships no helper scripts. The commands above are the complete launch, doctor, drive, evidence, and cleanup recipe.

## Secondary surfaces

The Google Apps Script in `apps-script/Code.gs` runs outside the Worker and needs Google Drive authorization. `scripts/formula-notifier.mjs` runs on macOS and needs a real TiDB connection plus notification permissions. Their external boundaries are documented in repository docs, but this local Worker run cannot prove them.
