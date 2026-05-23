import { connect } from "@tidbcloud/serverless";
import { describe, expect, it, vi } from "vitest";
import {
  createTiDBPiyologRepository,
  TiDBPiyologRepository,
} from "../src/repository";

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

describe("TiDBPiyologRepository", () => {
  it("inserts raw text export and metadata", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBPiyologRepository(connection);

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

  it("inserts parsed events for a raw text export", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBPiyologRepository(connection);

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
    const repository = new TiDBPiyologRepository(connection);

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
    const repository = new TiDBPiyologRepository(connection);

    await repository.deleteEventsByDates([]);

    expect(connection.calls).toEqual([]);
  });

  it("deduplicates event dates before deleting normalized events", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBPiyologRepository(connection);

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
    const repository = new TiDBPiyologRepository(connection);

    await repository.insertEvents(42, []);

    expect(connection.calls).toEqual([]);
  });

  it("returns null id when the driver does not expose lastInsertId", async () => {
    const connection = {
      async execute() {
        return { lastInsertId: null };
      },
    };
    const repository = new TiDBPiyologRepository(connection);

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
    const repository = new TiDBPiyologRepository(connection);

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
    createTiDBPiyologRepository("mysql://example");

    expect(connect).toHaveBeenCalledWith({
      url: "mysql://example",
      fullResult: true,
    });
  });
});
