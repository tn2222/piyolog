import { describe, expect, it, vi } from "vitest";
import { parsePiyologDataFeed } from "../src/domain/piyologDataFeed";
import { TiDBPiyologDataFeedRepository } from "../src/infrastructure/repository/tidbPiyologDataFeedRepository";

describe("TiDBPiyologDataFeedRepository", () => {
  it("deletes the half-open range and bulk upserts the data feed using the supplied connection", async () => {
    const connection = { execute: vi.fn(async (_sql: string) => ({ rows: [] })) };
    const repository = new TiDBPiyologDataFeedRepository(connection);
    const dataFeed = dataFeedWithRecords();

    await expect(repository.replaceRange(dataFeed)).resolves.toBeUndefined();

    expect(connection.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("DELETE FROM piyolog_feed_events"),
      ["2026-09-16 00:00:00.000", "2026-09-16 01:00:00.000"],
    );
    expect(connection.execute).toHaveBeenNthCalledWith(
      2,
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
    expect(connection.execute).toHaveBeenCalledTimes(2);
  });

  it("applies an empty data feed as a range clear", async () => {
    const connection = { execute: vi.fn(async (_sql: string) => ({ rows: [] })) };
    const repository = new TiDBPiyologDataFeedRepository(connection);
    const dataFeed = parsePiyologDataFeed({
      schema_version: 1,
      generated_at: "2026-09-16T01:00:00.000Z",
      range: {
        from: "2026-09-16T00:00:00.000Z",
        to: "2026-09-16T01:00:00.000Z",
      },
      records: [],
    });

    await expect(repository.replaceRange(dataFeed)).resolves.toBeUndefined();
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(connection.execute).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO piyolog_feed_events"),
      expect.anything(),
    );
  });

  it("chunks large data feeds using the supplied connection", async () => {
    const connection = { execute: vi.fn(async (_sql: string) => ({ rows: [] })) };
    const repository = new TiDBPiyologDataFeedRepository(connection);
    const dataFeed = parsePiyologDataFeed({
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

    await repository.replaceRange(dataFeed);

    const insertCalls = connection.execute.mock.calls.filter(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO piyolog_feed_events"),
    );
    expect(insertCalls).toHaveLength(2);
  });

});

function dataFeedWithRecords() {
  return parsePiyologDataFeed({
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
