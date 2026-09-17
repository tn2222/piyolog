# Public feed refresh

## Sub-features

- `feed-fetch` invokes the configured HTTPS Piyolog feed from the Worker schedule.
- `range-replace` replaces the returned half-open range and keeps records outside it.
- `event-id-upsert` leaves one row per feed `event_id` after a repeated refresh.

## How to get to it (user POV)

The Worker Cron Trigger runs every five minutes. Grafana and the Mac milk notifier read `piyolog_feed_events` after a successful refresh.

## Driving it with curl

Preconditions:

- `PIYOLOG_VERIFY_BASE_URL` points to a local Worker launched with a disposable TiDB database.
- The disposable database has `migrations/004_create_piyolog_feed_tables.sql` and `migrations/005_create_piyolog_feed_event_type_labels.sql` applied.
- `PIYOLOG_FEED_URL` points to an HTTPS test feed with synthetic records only.

Trigger one scheduled run and retain the HTTP response:

```sh
curl -sS -D "$ARTIFACT_DIR/feed.response.headers" \
  "$PIYOLOG_VERIFY_BASE_URL/cdn-cgi/handler/scheduled" \
  >"$ARTIFACT_DIR/feed.response.body"
```

Assert HTTP `200`, then query the disposable database for the returned range. Run the same scheduled request again and assert that each `event_id` still has one row. Query a row outside the returned range before and after the refresh to prove it remains.

## Gotchas

- The scheduled endpoint needs a real TiDB connection and an HTTPS feed URL, so an isolated MCP ping does not prove this feature.
- Never retain the feed URL, feed credential, or personal records in evidence.
- A fetch, validation, or database error must leave the previous projection unchanged; inspect the database before treating the run as successful.
