# Text export ingestion

The text export feature accepts a Piyolog text export, stores the raw export, and replaces normalized events for the dates contained in that text.

## Sub-features

- `text-auth` requires the ingest token.
- `text-parse` turns a timestamped Japanese row into a normalized event.
- `text-date-replace` removes existing rows for received dates before inserting the parsed rows.

## How to get to it (user POV)

- Send a `POST` request to `/api/text-records?token=$PIYOLOG_VERIFY_TOKEN` from the Google Apps Script integration.

## Driving it with curl

Preconditions:

- The Worker was launched with a disposable TiDB `DATABASE_URL` and `INGEST_TOKEN` in `.dev.vars`.
- `PIYOLOG_VERIFY_TOKEN` matches that local ingest token.
- `RUN_ID` and `ARTIFACT_DIR` are set. Use a unique synthetic `fileId` for this run.

- **Send a synthetic export.**

  ```sh
  printf '%s\n' '{"source":"verification","fileId":"verify-'"$RUN_ID"'","fileName":"verify.txt","updatedAt":"2026-01-01T12:00:00.000Z","text":"2026/1/1(木)\n赤ちゃん (0か月)\n12:00   ミルク 40ml"}' >"$ARTIFACT_DIR/text-export.request.json"
  curl -sS -D "$ARTIFACT_DIR/text-export.response.headers" \
    -H 'content-type: application/json' \
    --data-binary @"$ARTIFACT_DIR/text-export.request.json" \
    "$BASE_URL/api/text-records?token=${PIYOLOG_VERIFY_TOKEN}" >"$ARTIFACT_DIR/text-export.response.json"
  ```

  Assert HTTP `200`, `ok: true`, and `events: 1`.

- **Verify the side effect.** Run a read-only SQL query against the disposable database for `event_date = '2026-01-01'` and the unique verification file or raw payload ID. Retain the query and output in `ARTIFACT_DIR`; expect one `ミルク` event with amount `40` and unit `ml`.

- **Check unauthorized behavior.** Repeat the request with `token=wrong` and assert HTTP `401` without a database write.

## Gotchas

- The handler stores the raw export before replacing normalized rows, so a database failure must be investigated with both tables in mind.
- The existing route replaces all rows for every date header in the submitted text; do not use a production database for this mutation proof.
- The text parser accepts Japanese export syntax. A JSON body with no non-empty `text` is rejected with HTTP `400`.
