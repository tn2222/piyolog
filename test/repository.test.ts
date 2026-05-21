import { connect } from "@tidbcloud/serverless";
import { describe, expect, it, vi } from "vitest";
import {
  createTiDBRawPayloadRepository,
  TiDBRawPayloadRepository,
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

describe("TiDBRawPayloadRepository", () => {
  it("inserts raw payload JSON and metadata", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBRawPayloadRepository(connection);

    const result = await repository.insert({
      sourceIp: "203.0.113.10",
      userAgent: "Piyolog Custom Action",
      payload: { records: [{ type: "milk", amount: 50 }] },
    });

    expect(result).toEqual({ id: 42 });
    expect(connection.calls).toEqual([
      {
        sql: `
INSERT INTO raw_piyolog_payloads (source_ip, user_agent, payload_json)
VALUES (?, ?, CAST(? AS JSON))
        `.trim(),
        params: [
          "203.0.113.10",
          "Piyolog Custom Action",
          JSON.stringify({ records: [{ type: "milk", amount: 50 }] }),
        ],
      },
    ]);
  });

  it("inserts parsed events for a raw payload", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBRawPayloadRepository(connection);

    await repository.insertEvents(42, [
      {
        babyNickname: "凛ちゃん",
        eventDate: "2026-05-21",
        occurredAt: "2026-05-21 04:30:00",
        eventType: "Formula",
        amountValue: 50,
        amountUnit: "ml",
        leftSeconds: null,
        rightSeconds: null,
        lastSide: null,
        rawEvent: {
          hour: 4,
          minute: 30,
          type: "Formula",
          value: { unit: "ml", value: 50 },
        },
      },
      {
        babyNickname: "凛ちゃん",
        eventDate: "2026-05-21",
        occurredAt: "2026-05-21 13:10:00",
        eventType: "BreastFeeding",
        amountValue: null,
        amountUnit: null,
        leftSeconds: 397.8564898967743,
        rightSeconds: 128.1482539176941,
        lastSide: "right",
        rawEvent: {
          hour: 13,
          minute: 10,
          type: "BreastFeeding",
          leftTime: 397.8564898967743,
          rightTime: 128.1482539176941,
          last: "right",
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
          "凛ちゃん",
          "2026-05-21",
          "2026-05-21 04:30:00",
          "Formula",
          50,
          "ml",
          null,
          null,
          null,
          JSON.stringify({
            hour: 4,
            minute: 30,
            type: "Formula",
            value: { unit: "ml", value: 50 },
          }),
          42,
          "凛ちゃん",
          "2026-05-21",
          "2026-05-21 13:10:00",
          "BreastFeeding",
          null,
          null,
          397.8564898967743,
          128.1482539176941,
          "right",
          JSON.stringify({
            hour: 13,
            minute: 10,
            type: "BreastFeeding",
            leftTime: 397.8564898967743,
            rightTime: 128.1482539176941,
            last: "right",
          }),
        ],
      },
    ]);
  });

  it("deletes normalized events for the received event dates", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBRawPayloadRepository(connection);

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
    const repository = new TiDBRawPayloadRepository(connection);

    await repository.deleteEventsByDates([]);

    expect(connection.calls).toEqual([]);
  });

  it("deduplicates event dates before deleting normalized events", async () => {
    const connection = new FakeConnection();
    const repository = new TiDBRawPayloadRepository(connection);

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
    const repository = new TiDBRawPayloadRepository(connection);

    await repository.insertEvents(42, []);

    expect(connection.calls).toEqual([]);
  });

  it("returns null id when the driver does not expose lastInsertId", async () => {
    const connection = {
      async execute() {
        return { lastInsertId: null };
      },
    };
    const repository = new TiDBRawPayloadRepository(connection);

    const result = await repository.insert({
      sourceIp: null,
      userAgent: null,
      payload: { ok: true },
    });

    expect(result).toEqual({ id: null });
  });

  it("rejects unsafe insert IDs", async () => {
    const connection = {
      async execute() {
        return { lastInsertId: "9007199254740992" };
      },
    };
    const repository = new TiDBRawPayloadRepository(connection);

    await expect(
      repository.insert({
        sourceIp: null,
        userAgent: null,
        payload: { ok: true },
      }),
    ).rejects.toThrow("Unsafe TiDB insert id");
  });

  it("creates a full-result TiDB connection", () => {
    createTiDBRawPayloadRepository("mysql://example");

    expect(connect).toHaveBeenCalledWith({
      url: "mysql://example",
      fullResult: true,
    });
  });
});
