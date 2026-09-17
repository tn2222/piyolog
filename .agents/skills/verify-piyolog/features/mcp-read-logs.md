# MCP log reading

The protected MCP read feature returns time-stamped baby events and diary journals for a bounded date range.

## Sub-features

- `read-tool-list` exposes `get_recent_baby_logs` only with the ingest token.
- `read-tool-call` returns a structured range and day list from TiDB.
- `read-unauthorized` rejects the same call without the token.

## How to get to it (user POV)

- Connect an MCP client to `/mcp?token=$PIYOLOG_VERIFY_TOKEN`.
- Call `get_recent_baby_logs` with ISO date strings for `from` and `to`.

## Driving it with curl

Preconditions:

- `PIYOLOG_VERIFY_BASE_URL` points to a deployed Worker or a local Worker whose Secrets Store bindings resolve.
- `PIYOLOG_VERIFY_TOKEN` is the real ingest token for that Worker.
- The Worker has a reachable TiDB database with `piyolog_events` and `piyolog_diaries`.
- Store response artifacts privately because they contain family data.

- **List protected tools.**

  ```sh
  BASE_URL="${PIYOLOG_VERIFY_BASE_URL:?set PIYOLOG_VERIFY_BASE_URL}"
  curl -sS -D "$ARTIFACT_DIR/mcp-read-tools.headers" \
    -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
    "$BASE_URL/mcp?token=${PIYOLOG_VERIFY_TOKEN}" >"$ARTIFACT_DIR/mcp-read-tools.json"
  ```

  The body contains both `ping_piyolog` and `get_recent_baby_logs`.

- **Call the read tool.**

  ```sh
  printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_recent_baby_logs","arguments":{"from":"2026-01-01","to":"2026-01-02","includeDiaries":true}}}' >"$ARTIFACT_DIR/mcp-read.request.json"
  curl -sS -D "$ARTIFACT_DIR/mcp-read.response.headers" \
    -H 'content-type: application/json' \
    --data-binary @"$ARTIFACT_DIR/mcp-read.request.json" \
    "$BASE_URL/mcp?token=${PIYOLOG_VERIFY_TOKEN}" >"$ARTIFACT_DIR/mcp-read.response.json"
  ```

  Assert HTTP `200`, a `structuredContent.range`, and a `structuredContent.days` array. Query TiDB read-only for the same date range and retain that output beside the response.

- **Check the guard.** Send the same request to `$BASE_URL/mcp` without the query token. Assert JSON-RPC error code `-32001` and retain the response as `mcp-read.unauthorized.json`.

## Gotchas

- The token is the credential. Do not print it, store it in a request artifact, or commit an artifact containing the URL.
- The date range is inclusive at `from`, exclusive at `to`, and cannot exceed 35 days.
- This route contacts TiDB and may return an application error when the schema or external secret is unavailable; do not treat that as an empty log.
