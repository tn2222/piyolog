import { describe, expect, it } from "vitest";
import { TiDBSummaryPeriodQueryService } from "../src/gateway/summaryPeriodQueryService";

type QueryCall = {
  sql: string;
  params: unknown[];
};

type QueryResult = {
  lastInsertId: string | null;
  rows: Record<string, unknown>[];
};

class FakeConnection {
  public calls: QueryCall[] = [];
  private resultIndex = 0;

  constructor(private readonly results: QueryResult[]) {}

  async execute(sql: string, params: unknown[]) {
    this.calls.push({ sql, params });
    return this.results[this.resultIndex++] ?? { lastInsertId: null, rows: [] };
  }
}

describe("TiDBSummaryPeriodQueryService", () => {
  it("groups period events and diary journals by date", async () => {
    const connection = new FakeConnection([
      {
        lastInsertId: null,
        rows: [
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
          {
            occurred_at: "2026-06-03 10:00:00",
            event_date: "2026-06-03",
            event_type: "睡眠",
            amount_value: null,
            amount_unit: null,
            left_seconds: null,
            right_seconds: null,
            last_side: null,
            raw_event: { time: "10:00", label: "睡眠" },
          },
        ],
      },
      {
        lastInsertId: null,
        rows: [
          {
            entry_date: "2026-06-01",
            journal: "今日はよく寝た",
          },
          {
            entry_date: "2026-06-02",
            journal: "日記だけの日",
          },
          {
            entry_date: "2026-06-03",
            journal: "",
          },
        ],
      },
    ]);
    const queryService = new TiDBSummaryPeriodQueryService(connection);

    const result = await queryService.summarizePeriod({
      range: { from: "2026-06-01", to: "2026-06-04" },
      granularity: "day",
      includeMetrics: ["milk_amount", "sleep_duration"],
    });

    expect(result).toEqual({
      range: { from: "2026-06-01", to: "2026-06-04" },
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
          journal: "日記だけの日",
        },
        {
          date: "2026-06-03",
          events: [
            {
              occurred_at: "2026-06-03 10:00:00",
              event_date: "2026-06-03",
              event_type: "睡眠",
              amount_value: null,
              amount_unit: null,
              left_seconds: null,
              right_seconds: null,
              last_side: null,
              raw_event: { time: "10:00", label: "睡眠" },
            },
          ],
          journal: null,
        },
      ],
    });
    expect(connection.calls).toEqual([
      {
        sql: `
SELECT
  occurred_at,
  event_date,
  event_type,
  amount_value,
  amount_unit,
  left_seconds,
  right_seconds,
  last_side,
  raw_event
FROM piyolog_events
WHERE occurred_at >= ?
  AND occurred_at < ?
ORDER BY occurred_at
        `.trim(),
        params: [
          "2026-06-01 00:00:00",
          "2026-06-04 00:00:00",
        ],
      },
      {
        sql: `
SELECT
  entry_date,
  journal
FROM piyolog_diaries
WHERE entry_date >= ?
  AND entry_date < ?
ORDER BY entry_date
        `.trim(),
        params: [
          "2026-06-01",
          "2026-06-04",
        ],
      },
    ]);
  });
});
