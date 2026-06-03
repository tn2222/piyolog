import { connect } from "@tidbcloud/serverless";
import { describe, expect, it, vi } from "vitest";
import {
  createTiDBBabyLogRepository,
  TiDBBabyLogRepository,
} from "../src/gateway/tidbBabyLogRepository";

vi.mock("@tidbcloud/serverless", () => ({
  connect: vi.fn(() => ({
    execute: vi.fn(),
  })),
}));

type QueryCall = {
  sql: string;
  params: unknown[];
};

class FakeConnection {
  public calls: QueryCall[] = [];

  async execute(sql: string, params: unknown[]) {
    this.calls.push({ sql, params });
    return {
      lastInsertId: "42",
    };
  }
}

describe("TiDBBabyLogRepository", () => {
  it("inserts raw text export and metadata", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBBabyLogRepository(connection);

    const result = await repository.insertTextExport({
      source: "google_drive_text_export",
      fileId: "drive-file-id",
      fileName: "piyolog-2026-05-22.txt",
      updatedAt: "2026-05-22T00:10:00.000Z",
      sourceIp: "203.0.113.10",
      userAgent: "Google-Apps-Script",
      text: "2026/5/22(金)\n01:00   ミルク 40ml",
    });

    expect(result).toEqual({ id: 42 });
    expect(connection.calls).toEqual([
      {
        sql: `
INSERT INTO raw_piyolog_text_exports (
  source,
  file_id,
  file_name,
  file_updated_at,
  source_ip,
  user_agent,
  text_body
)
VALUES (?, ?, ?, ?, ?, ?, ?)
        `.trim(),
        params: [
          "google_drive_text_export",
          "drive-file-id",
          "piyolog-2026-05-22.txt",
          "2026-05-22 00:10:00",
          "203.0.113.10",
          "Google-Apps-Script",
          "2026/5/22(金)\n01:00   ミルク 40ml",
        ],
      },
    ]);
  });

  it("upserts diary journals by baby and entry date", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBBabyLogRepository(connection);

    await repository.upsertDiaries([
      {
        babyNickname: "赤ちゃん",
        babyDateOfBirth: "2026-05-06",
        babySex: "Female",
        entryDate: "2026-06-01",
        journal: "今日はよく寝た",
        rawDay: {
          date: { year: 2026, month: 6, day: 1 },
          journal: "今日はよく寝た",
        },
      },
      {
        babyNickname: "赤ちゃん",
        babyDateOfBirth: "2026-05-06",
        babySex: "Female",
        entryDate: "2026-06-02",
        journal: "",
        rawDay: {
          date: { year: 2026, month: 6, day: 2 },
          journal: "",
        },
      },
    ]);

    expect(connection.calls).toEqual([
      {
        sql: `
INSERT INTO piyolog_diaries (
  baby_nickname,
  baby_date_of_birth,
  baby_sex,
  entry_date,
  journal,
  raw_day
)
VALUES (?, ?, ?, ?, ?, CAST(? AS JSON)), (?, ?, ?, ?, ?, CAST(? AS JSON))
ON DUPLICATE KEY UPDATE
  baby_sex = VALUES(baby_sex),
  journal = VALUES(journal),
  raw_day = VALUES(raw_day),
  updated_at = CURRENT_TIMESTAMP
        `.trim(),
        params: [
          "赤ちゃん",
          "2026-05-06",
          "Female",
          "2026-06-01",
          "今日はよく寝た",
          JSON.stringify({
            date: { year: 2026, month: 6, day: 1 },
            journal: "今日はよく寝た",
          }),
          "赤ちゃん",
          "2026-05-06",
          "Female",
          "2026-06-02",
          "",
          JSON.stringify({
            date: { year: 2026, month: 6, day: 2 },
            journal: "",
          }),
        ],
      },
    ]);
  });

  it("skips diary upsert when there are no journals", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBBabyLogRepository(connection);

    await repository.upsertDiaries([]);

    expect(connection.calls).toEqual([]);
  });

  it("inserts parsed events for a raw text export", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBBabyLogRepository(connection);

    await repository.insertEvents(42, [
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-21",
        occurredAt: "2026-05-21 04:30:00",
        eventType: "ミルク",
        amountValue: 50,
        amountUnit: "ml",
        leftSeconds: null,
        rightSeconds: null,
        lastSide: null,
        rawEvent: {
          source: "text_export",
          label: "ミルク",
          note: null,
          rawLine: "04:30   ミルク 50ml",
        },
      },
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-21",
        occurredAt: "2026-05-21 13:10:00",
        eventType: "母乳",
        amountValue: null,
        amountUnit: null,
        leftSeconds: 420,
        rightSeconds: 300,
        lastSide: "right",
        rawEvent: {
          source: "text_export",
          label: "母乳",
          note: null,
          rawLine: "13:10   母乳 左7分 ▶ 右5分",
        },
      },
    ]);

    expect(connection.calls).toEqual([
      {
        sql: `
INSERT INTO piyolog_events (
  raw_payload_id,
  baby_nickname,
  event_date,
  occurred_at,
  event_type,
  amount_value,
  amount_unit,
  left_seconds,
  right_seconds,
  last_side,
  raw_event
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON)), (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))
        `.trim(),
        params: [
          42,
          "赤ちゃん",
          "2026-05-21",
          "2026-05-21 04:30:00",
          "ミルク",
          50,
          "ml",
          null,
          null,
          null,
          JSON.stringify({
            source: "text_export",
            label: "ミルク",
            note: null,
            rawLine: "04:30   ミルク 50ml",
          }),
          42,
          "赤ちゃん",
          "2026-05-21",
          "2026-05-21 13:10:00",
          "母乳",
          null,
          null,
          420,
          300,
          "right",
          JSON.stringify({
            source: "text_export",
            label: "母乳",
            note: null,
            rawLine: "13:10   母乳 左7分 ▶ 右5分",
          }),
        ],
      },
    ]);
  });

  it("deletes normalized events for the received event dates", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBBabyLogRepository(connection);

    await repository.deleteEventsByDates(["2026-05-20", "2026-05-21"]);

    expect(connection.calls).toEqual([
      {
        sql: "DELETE FROM piyolog_events WHERE event_date IN (?, ?)",
        params: ["2026-05-20", "2026-05-21"],
      },
    ]);
  });

  it("skips deleting events when there are no received event dates", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBBabyLogRepository(connection);

    await repository.deleteEventsByDates([]);

    expect(connection.calls).toEqual([]);
  });

  it("deduplicates event dates before deleting normalized events", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBBabyLogRepository(connection);

    await repository.deleteEventsByDates(["2026-05-21", "2026-05-20", "2026-05-21"]);

    expect(connection.calls).toEqual([
      {
        sql: "DELETE FROM piyolog_events WHERE event_date IN (?, ?)",
        params: ["2026-05-21", "2026-05-20"],
      },
    ]);
  });

  it("skips event insertion when there are no parsed events", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBBabyLogRepository(connection);

    await repository.insertEvents(42, []);

    expect(connection.calls).toEqual([]);
  });

  it("returns null id when the driver does not expose lastInsertId", async () => {
    const connection = {
      async execute() {
        return { lastInsertId: null };
      },
    };
    const repository = new TiDBBabyLogRepository(connection);

    const result = await repository.insertTextExport({
      source: "google_drive_text_export",
      fileId: null,
      fileName: null,
      updatedAt: null,
      sourceIp: null,
      userAgent: null,
      text: "2026/5/22(金)",
    });

    expect(result).toEqual({ id: null });
  });

  it("rejects unsafe insert IDs", async () => {
    const connection = {
      async execute() {
        return { lastInsertId: "9007199254740992" };
      },
    };
    const repository = new TiDBBabyLogRepository(connection);

    await expect(
      repository.insertTextExport({
        source: "google_drive_text_export",
        fileId: null,
        fileName: null,
        updatedAt: null,
        sourceIp: null,
        userAgent: null,
        text: "2026/5/22(金)",
      }),
    ).rejects.toThrow("Unsafe TiDB insert id");
  });

  it("creates a full-result TiDB connection", () => {
    createTiDBBabyLogRepository("mysql://example");

    expect(connect).toHaveBeenCalledWith({
      url: "mysql://example",
      fullResult: true,
    });
  });

  it("compares milk amount with parameterized SQL", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBBabyLogRepository(connection);

    await repository.compareMetric({
      metric: "milk_amount",
      currentRange: { from: "2026-05-24", to: "2026-05-31" },
      previousRange: { from: "2026-05-17", to: "2026-05-24" },
      aggregation: "sum",
      groupBy: "none",
    });

    expect(connection.calls).toEqual([
      {
        sql: `
SELECT
  CASE
    WHEN occurred_at >= ? AND occurred_at < ? THEN 'current'
    WHEN occurred_at >= ? AND occurred_at < ? THEN 'previous'
  END AS period,
  COALESCE(SUM(amount_value), 0) AS value,
  COUNT(*) AS event_count
FROM piyolog_events
WHERE occurred_at >= ?
  AND occurred_at < ?
  AND event_type = ?
  AND amount_unit = ?
GROUP BY period
        `.trim(),
        params: [
          "2026-05-24 00:00:00",
          "2026-05-31 00:00:00",
          "2026-05-17 00:00:00",
          "2026-05-24 00:00:00",
          "2026-05-17 00:00:00",
          "2026-05-31 00:00:00",
          "ミルク",
          "ml",
        ],
      },
    ]);
  });

  it("loads all period events for summary analysis with parameterized SQL", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBBabyLogRepository(connection);

    await repository.summarizePeriod({
      range: { from: "2026-05-01", to: "2026-06-01" },
      granularity: "day",
      includeMetrics: ["milk_amount", "sleep_duration", "diaper_count"],
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
          "2026-05-01 00:00:00",
          "2026-06-01 00:00:00",
        ],
      },
    ]);
  });
});
