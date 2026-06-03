# Summary Period Diaries Design

## Context

ZAWA-53 extends the LLM answer flow so `summarize_period` can use Piyolog diary journals in addition to timestamped events.

The project already stores timestamped records in `piyolog_events` and diary journals in `piyolog_diaries`. These have different lifecycles and should remain separate aggregates. The LLM answer flow, however, needs a read model that combines both sources by date.

The existing `summarizePeriod` repository method returns raw event rows from `piyolog_events`. That shape forces the LLM to infer the relationship between event rows and diary rows. The new design moves that composition into a query service.

## Decision

Add a `SummaryPeriodQueryService` for the `summarize_period` tool.

The query service returns an LLM-oriented read model grouped by day. It reads period events and diary journals from TiDB, combines them by date, and returns `days` instead of raw top-level `rows`.

```ts
type SummaryPeriodQueryService = {
  summarizePeriod(input: SummarizePeriodInput): Promise<SummarizePeriodResult>;
};

type SummarizePeriodResult = {
  range: DateRange;
  granularity: SummaryGranularityName;
  days: SummaryPeriodDay[];
};

type SummaryPeriodDay = {
  date: string;
  events: Record<string, unknown>[];
  journal: string | null;
};
```

`events` contains the same event fields currently selected for `summarize_period`:

```ts
{
  occurred_at,
  event_date,
  event_type,
  amount_value,
  amount_unit,
  left_seconds,
  right_seconds,
  last_side,
  raw_event,
}
```

`journal` contains the diary text for the same date. Missing diaries and empty-string diaries are exposed as `null`.

The query service includes days that have events, diaries, or both:

```ts
{
  range: { from: "2026-06-01", to: "2026-06-08" },
  granularity: "day",
  days: [
    {
      date: "2026-06-01",
      events: [
        {
          occurred_at: "2026-06-01 08:30:00",
          event_date: "2026-06-01",
          event_type: "ミルク",
          amount_value: 120,
          amount_unit: "ml",
          left_seconds: null,
          right_seconds: null,
          last_side: null,
          raw_event: { time: "08:30", label: "ミルク", detail: "120ml" },
        },
      ],
      journal: "今日はよく寝た",
    },
    {
      date: "2026-06-02",
      events: [],
      journal: "日記だけの日も含める",
    },
  ],
}
```

## Data Access

`TiDBSummaryPeriodQueryService` performs read-only queries against TiDB.

Events are selected from `piyolog_events` by `occurred_at >= from` and `occurred_at < to`, ordered by `occurred_at`.

Diaries are selected from `piyolog_diaries` by `entry_date >= from` and `entry_date < to`, ordered by `entry_date`. The query does not filter by `baby_nickname` or `baby_date_of_birth`. Current usage assumes a single baby.

The service combines rows in application code by date. This avoids losing diary-only days, which would happen with an event-rooted SQL `LEFT JOIN`.

## Use Case Integration

`askAssistant()` receives a `summaryPeriodQueryService` input alongside the existing `repository` and `llmGateway`.

For `compare_metric`, `askAssistant()` keeps using `repository.compareMetric()` and does not include diaries.

For `summarize_period`, `askAssistant()` calls `summaryPeriodQueryService.summarizePeriod()` and passes the returned read model in `toolResults[].result`.

The answer-generation instructions include a lightweight diary handling note:

```text
育児日記は日付単位の補足観察として扱い、時刻付きイベント記録と区別して参照する。
```

This instruction is intentionally small and can be tuned after observing real answer behavior.

## Scope

Included:

- Add `SummaryPeriodQueryService`.
- Add `TiDBSummaryPeriodQueryService`.
- Change `summarize_period` tool results from top-level `rows` to day-grouped `days`.
- Include non-empty diary journals in the day-grouped read model.
- Treat empty-string journals as `null`.
- Inject the query service into `askAssistant()`.
- Add a TODO comment to `TiDBBabyLogRepository` noting that diary write responsibility is temporary and should be separated by aggregate boundary in a later refactor.
- Update tests for use case wiring and TiDB query behavior.

Excluded:

- Refactoring `TiDBBabyLogRepository` into aggregate-specific repositories.
- Multiple-baby filtering.
- Diary length limits or pre-summarization.
- Changing `compare_metric`.
- Tuning prompts beyond the small diary handling note.

## Testing

Tests should cover:

- `askAssistant()` uses `summaryPeriodQueryService` for `summarize_period`.
- `askAssistant()` keeps using `repository.compareMetric()` for `compare_metric`.
- `summarize_period` tool result includes day-grouped events and journals.
- Diary-only days are included with `events: []`.
- Event-only days are included with `journal: null`.
- Empty-string diary journals are treated as `null`.
- TiDB queries are parameterized and use the requested date range.

Run:

```sh
npm test
npm run typecheck
```
