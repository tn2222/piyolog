# Diary capture

The diary capture feature accepts a Piyolog custom-action payload and upserts each `days[].journal` value into `piyolog_diaries`.

## Sub-features

- `diary-auth` requires the ingest token.
- `diary-upsert` stores a day journal and its raw day payload.
- `diary-clear` preserves an empty journal when the source clears a diary.

## How to get to it (user POV)

- Send a `POST` request to `/api/custom-action-captures?token=$PIYOLOG_VERIFY_TOKEN` from the Piyolog custom action.

## Driving it with curl

Preconditions:

- The Worker was launched with a disposable TiDB `DATABASE_URL` and `INGEST_TOKEN` in `.dev.vars`.
- `PIYOLOG_VERIFY_TOKEN` matches that local ingest token.
- `RUN_ID` and `ARTIFACT_DIR` are set.

- **Capture a journal.**

  ```sh
  printf '%s\n' '{"baby":{"nickname":"verification","sex":"Unknown","dateOfBirth":{"year":2026,"month":1,"day":1}},"days":[{"date":{"year":2026,"month":1,"day":1},"events":[],"journal":"verification journal '"$RUN_ID"'"}]}' >"$ARTIFACT_DIR/diary.request.json"
  curl -sS -D "$ARTIFACT_DIR/diary.response.headers" \
    -H 'content-type: application/json' \
    --data-binary @"$ARTIFACT_DIR/diary.request.json" \
    "$BASE_URL/api/custom-action-captures?token=${PIYOLOG_VERIFY_TOKEN}" >"$ARTIFACT_DIR/diary.response.json"
  ```

  Assert HTTP `200` and `{"ok":true,"diaries":1}`.

- **Verify persistence.** Run a read-only SQL query against the disposable database for the synthetic nickname and date. Retain the query and output in `ARTIFACT_DIR`; expect the journal text and `raw_day` JSON.

- **Verify clearing.** Send the same day with `journal` equal to an empty string, assert HTTP `200`, then query the row and confirm `journal = ''`.

## Gotchas

- A malformed day is ignored and may result in `diaries: 0` with HTTP `200`; assert the count and inspect the payload.
- Diary data is separate from normalized event data and is used by the LLM summary path.
- Never use a real child nickname or diary text in a committed artifact.
