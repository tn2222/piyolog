# Slack slash command

The Slack slash command feature accepts a form-encoded command and returns an ephemeral acknowledgement or answer.

## Sub-features

- `slack-auth` rejects an invalid Slack command token.
- `slack-sync` returns the assistant answer when no `response_url` is supplied.
- `slack-async` acknowledges immediately and posts the eventual answer to `response_url`.

## How to get to it (user POV)

- Configure the Slack slash command request URL as `/api/slack/commands`.
- Enter a natural-language育児ログ question after the slash command.

## Driving it with curl

Preconditions:

- `PIYOLOG_VERIFY_BASE_URL` points to a deployed Worker or a local Worker with all LLM and TiDB dependencies configured.
- `PIYOLOG_VERIFY_SLACK_TOKEN` is the configured Slack command token.
- The LLM Gateway is safe to call with a synthetic question and has no production side effect.

- **Send a synchronous command.**

  ```sh
  curl -sS -D "$ARTIFACT_DIR/slack.response.headers" \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode "token=${PIYOLOG_VERIFY_SLACK_TOKEN}" \
    --data-urlencode 'text=verification question' \
    "$PIYOLOG_VERIFY_BASE_URL/api/slack/commands" >"$ARTIFACT_DIR/slack.response.json"
  ```

  Assert HTTP `200`, `response_type: "ephemeral"`, and a non-empty `text`. Capture the LLM Gateway request or response only if its own privacy policy permits it.

- **Check unauthorized behavior.** Send `token=wrong` with the same synthetic text and assert HTTP `401`; no LLM or database call should occur.

## Gotchas

- This route can invoke the external LLM Gateway and TiDB. A local Worker without those services is not a valid verification target.
- A `response_url` changes the path to an asynchronous `waitUntil` task and sends a later webhook request. Use a controlled test webhook before verifying that branch.
- Do not put Slack tokens or family questions in evidence.
