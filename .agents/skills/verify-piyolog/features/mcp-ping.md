# MCP connectivity

The MCP connectivity feature lets a user confirm that ChatGPT or an MCP client can reach the Worker and call `ping_piyolog`.

## Sub-features

- `ping-call` returns `pong` from the real `/mcp` route.
- `ping-no-database` completes without TiDB, Secrets Store, or LLM Gateway access.

## How to get to it (user POV)

- Send an MCP `tools/call` request to the Worker `/mcp` endpoint.
- In ChatGPT, connect the MCP server URL and ask it to call `ping_piyolog`.

## Driving it with curl

Preconditions:

- The parent skill's Launch and Doctor sections passed.
- `BASE_URL` and `ARTIFACT_DIR` are set in the launch shell.

- **Call the tool.** Save the MCP request and send it through the public route.

  ```sh
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping_piyolog","arguments":{}}}' >"$ARTIFACT_DIR/mcp-ping.request.json"
  curl -sS -D "$ARTIFACT_DIR/mcp-ping.response.headers" \
    -H 'content-type: application/json' \
    --data-binary @"$ARTIFACT_DIR/mcp-ping.request.json" \
    "$BASE_URL/mcp" >"$ARTIFACT_DIR/mcp-ping.response.json"
  ```

  The response status is `200` and the body contains `result.structuredContent.message` equal to `pong`.

- **Assert the result.**

  ```sh
  node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const body = JSON.parse(readFileSync(process.argv[1], "utf8"));
  if (body.jsonrpc !== "2.0" || body.result?.structuredContent?.message !== "pong") process.exit(1);
  console.log(JSON.stringify({ ok: true, feature: "ping-call", message: body.result.structuredContent.message }));
  ' "$ARTIFACT_DIR/mcp-ping.response.json" | tee "$ARTIFACT_DIR/mcp-ping.assertion.json"
  ```

## Gotchas

- `ping_piyolog` does not prove that the database-backed read tool is authorized or healthy.
- Keep the MCP request free of tokens; the unauthenticated route is sufficient for this feature.
- The MCP client may send `initialize` and `tools/list` before `tools/call`; prove the actual `tools/call` as shown above.
