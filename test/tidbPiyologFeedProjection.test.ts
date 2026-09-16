import { describe, expect, it, vi } from "vitest";
import { parsePiyologFeedSnapshot } from "../src/domain/piyologFeed";
import { TiDBPiyologFeedProjection } from "../src/infrastructure/repository/tidbPiyologFeedProjection";

describe("TiDBPiyologFeedProjection", () => {
  it("deletes the half-open range and bulk upserts the snapshot in one transaction", async () => {
    const transaction = createTransaction({ generated_at: null });
    const projection = new TiDBPiyologFeedProjection({
      begin: vi.fn(async () => transaction),
    });
    const snapshot = snapshotWithRecords();

    await expect(projection.apply(snapshot)).resolves.toMatchObject({
      status: "applied",
      recordCount: 2,
    });

    expect(transaction.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("FOR UPDATE"),
      ["default"],
    );
    expect(transaction.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("DELETE FROM piyolog_feed_events"),
      ["2026-09-16 00:00:00.000", "2026-09-16 01:00:00.000"],
    );
    expect(transaction.execute).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("ON DUPLICATE KEY UPDATE"),
      [
        "formula",
        "2026-09-16 00:00:00.123",
        "Formula",
        60.5,
        "ml",
        null,
        null,
        null,
        null,
        null,
        null,
        JSON.stringify({
          event_id: "formula",
          datetime: "2026-09-16T00:00:00.123Z",
          type: "Formula",
          value: { value: 60.5, unit: "ml" },
        }),
        "poop",
        "2026-09-16 00:20:00.000",
        "Poop",
        null,
        null,
        null,
        null,
        null,
        "small",
        "normal",
        "yellow",
        JSON.stringify({
          event_id: "poop",
          datetime: "2026-09-16T00:20:00.000Z",
          type: "Poop",
          details: { amount: "small", hardness: "normal", color: "yellow" },
        }),
      ],
    );
    expect(transaction.execute).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("piyolog_feed_sync_state"),
      [
        "default",
        "2026-09-16 01:00:00.000",
        "2026-09-16 00:00:00.000",
        "2026-09-16 01:00:00.000",
      ],
    );
    expect(transaction.commit).toHaveBeenCalledOnce();
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it("applies an empty snapshot as a range clear", async () => {
    const transaction = createTransaction({ generated_at: null });
    const projection = new TiDBPiyologFeedProjection({
      begin: vi.fn(async () => transaction),
    });
    const snapshot = parsePiyologFeedSnapshot({
      schema_version: 1,
      generated_at: "2026-09-16T01:00:00.000Z",
      range: {
        from: "2026-09-16T00:00:00.000Z",
        to: "2026-09-16T01:00:00.000Z",
      },
      records: [],
    });

    await expect(projection.apply(snapshot)).resolves.toMatchObject({
      status: "applied",
      recordCount: 0,
    });
    expect(transaction.execute).toHaveBeenCalledTimes(3);
    expect(transaction.execute).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO piyolog_feed_events"),
      expect.anything(),
    );
  });

  it("chunks large snapshots inside the same transaction", async () => {
    const transaction = createTransaction({ generated_at: null });
    const projection = new TiDBPiyologFeedProjection({
      begin: vi.fn(async () => transaction),
    });
    const snapshot = parsePiyologFeedSnapshot({
      schema_version: 1,
      generated_at: "2026-09-16T02:00:00.000Z",
      range: {
        from: "2026-09-16T00:00:00.000Z",
        to: "2026-09-16T02:00:00.000Z",
      },
      records: Array.from({ length: 101 }, (_, index) => ({
        event_id: `event-${index}`,
        datetime: new Date(Date.UTC(2026, 8, 16, 0, index)).toISOString(),
        type: "Pee",
      })),
    });

    await projection.apply(snapshot);

    const insertCalls = transaction.execute.mock.calls.filter(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO piyolog_feed_events"),
    );
    expect(insertCalls).toHaveLength(2);
    expect(transaction.commit).toHaveBeenCalledOnce();
  });

  it("skips snapshots that are older or equal without data mutations", async () => {
    const transaction = createTransaction({ generated_at: "2026-09-16 01:00:00.000" });
    const projection = new TiDBPiyologFeedProjection({
      begin: vi.fn(async () => transaction),
    });

    await expect(projection.apply(snapshotWithRecords())).resolves.toMatchObject({
      status: "skipped",
    });
    expect(transaction.execute).toHaveBeenCalledTimes(1);
    expect(transaction.commit).toHaveBeenCalledOnce();
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it("rolls back and rethrows mutation errors", async () => {
    const transaction = createTransaction({ generated_at: null });
    transaction.execute.mockImplementationOnce(async () => ({ rows: [{ generated_at: null }] }));
    transaction.execute.mockRejectedValueOnce(new Error("delete failed"));
    const projection = new TiDBPiyologFeedProjection({
      begin: vi.fn(async () => transaction),
    });

    await expect(projection.apply(snapshotWithRecords())).rejects.toThrow("delete failed");
    expect(transaction.rollback).toHaveBeenCalledOnce();
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  it("rolls back when commit fails", async () => {
    const transaction = createTransaction({ generated_at: null });
    transaction.commit.mockRejectedValueOnce(new Error("commit failed"));
    const projection = new TiDBPiyologFeedProjection({
      begin: vi.fn(async () => transaction),
    });

    await expect(projection.apply(snapshotWithRecords())).rejects.toThrow("commit failed");
    expect(transaction.rollback).toHaveBeenCalledOnce();
  });
});

function createTransaction(state: { generated_at: string | null }) {
  const execute = vi.fn(async (sql: string) => {
    if (sql.includes("SELECT generated_at")) {
      return { rows: [state] };
    }
    return { rows: [] };
  });
  return {
    execute,
    commit: vi.fn(async () => ({})),
    rollback: vi.fn(async () => ({})),
  };
}

function snapshotWithRecords() {
  return parsePiyologFeedSnapshot({
    schema_version: 1,
    generated_at: "2026-09-16T01:00:00.000Z",
    range: {
      from: "2026-09-16T00:00:00.000Z",
      to: "2026-09-16T01:00:00.000Z",
    },
    records: [
      {
        event_id: "formula",
        datetime: "2026-09-16T00:00:00.123Z",
        type: "Formula",
        value: { value: 60.5, unit: "ml" },
      },
      {
        event_id: "poop",
        datetime: "2026-09-16T00:20:00.000Z",
        type: "Poop",
        details: { amount: "small", hardness: "normal", color: "yellow" },
      },
    ],
  });
}
