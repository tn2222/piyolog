# LINE webhook

The LINE webhook feature verifies the signed request, acknowledges valid webhook payloads, and schedules text-message handling.

## Sub-features

- `line-signature` accepts a valid HMAC-SHA256 signature.
- `line-empty-events` supports LINE Console verification with an empty event list.
- `line-text-event` schedules a text message for the assistant and reply client.

## How to get to it (user POV)

- Configure the LINE Messaging API webhook URL as `/api/line/webhook`.
- Send a LINE Console verification request or a text message through LINE.

## Driving it with curl

Preconditions:

- `PIYOLOG_VERIFY_BASE_URL` points to a deployed Worker or a local Worker with LINE and assistant dependencies configured.
- `PIYOLOG_VERIFY_LINE_SECRET` is the configured LINE channel secret.
- Use an empty `events` payload for a side-effect-free verification; do not send a real reply token.

- **Create a signed empty-event request.**

  ```sh
  printf '%s\n' '{"destination":"Uverification","events":[]}' >"$ARTIFACT_DIR/line.request.json"
  LINE_SIGNATURE="$(node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const secret = process.argv[1];
  const body = readFileSync(process.argv[2]);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, body);
  console.log(Buffer.from(digest).toString("base64"));
  ' "$PIYOLOG_VERIFY_LINE_SECRET" "$ARTIFACT_DIR/line.request.json")"
  curl -sS -D "$ARTIFACT_DIR/line.response.headers" \
    -H 'content-type: application/json' \
    -H "x-line-signature: $LINE_SIGNATURE" \
    --data-binary @"$ARTIFACT_DIR/line.request.json" \
    "$PIYOLOG_VERIFY_BASE_URL/api/line/webhook" >"$ARTIFACT_DIR/line.response.json"
  ```

  Assert HTTP `200` and `{"ok":true}`. Retain the body and response headers, but never retain the channel secret or a real reply token.

- **Check the signature guard.** Repeat the request with `x-line-signature: invalid` and assert HTTP `401`.

## Gotchas

- The signature covers the exact raw body bytes. Do not reserialize the JSON after calculating it.
- A valid text event schedules work through `waitUntil`; an HTTP `200` only proves acknowledgement, not the eventual assistant reply.
- This route needs the LINE channel secret even when `events` is empty.
