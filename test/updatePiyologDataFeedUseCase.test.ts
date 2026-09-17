import { describe, expect, it, vi } from "vitest";
import { parsePiyologDataFeedSnapshot } from "../src/domain/piyologDataFeed";
import { updatePiyologDataFeed } from "../src/application/updatePiyologDataFeedUseCase";
import { DatabaseTransaction } from "../src/infrastructure/transaction/databaseTransaction";

const snapshot = parsePiyologDataFeedSnapshot({
  schema_version: 1,
  generated_at: "2026-09-16T01:00:00.000Z",
  range: { from: "2026-09-16T00:00:00.000Z", to: "2026-09-16T01:00:00.000Z" },
  records: [{ event_id: "formula", datetime: "2026-09-16T00:30:00.000Z", type: "Formula" }],
});

function setup() {
  const steps: string[] = [];
  const client = {
    getDataFeed: vi.fn(async () => {
      steps.push("fetch");
      return snapshot;
    }),
  };
  const tx = {
    execute: vi.fn(async (sql: string) => {
      steps.push(sql.startsWith("DELETE") ? "delete" : "insert");
    }),
    commit: vi.fn(async () => { steps.push("commit"); }),
    rollback: vi.fn(async () => {}),
  };
  const connection = {
    begin: vi.fn(async () => {
      steps.push("begin");
      return tx;
    }),
    execute: vi.fn(),
  };
  return { steps, client, tx, connection, transaction: new DatabaseTransaction(connection) };
}

describe("updatePiyologDataFeed", () => {
  it("fetches before beginning and replaces the range through the transaction connection", async () => {
    const { steps, client, tx, connection, transaction } = setup();

    await expect(updatePiyologDataFeed({ client, transaction })).resolves.toEqual({
      generatedAt: snapshot.generatedAt,
      range: snapshot.range,
      recordCount: 1,
    });
    expect(steps).toEqual(["fetch", "begin", "delete", "insert", "commit"]);
    expect(connection.execute).not.toHaveBeenCalled();
    expect(tx.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("DELETE FROM piyolog_feed_events"),
      ["2026-09-16 00:00:00.000", "2026-09-16 01:00:00.000"],
    );
    expect(tx.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO piyolog_feed_events"),
      expect.arrayContaining(["formula", "2026-09-16 00:30:00.000", "Formula"]),
    );
  });

  it("does not start a transaction when fetching fails", async () => {
    const { client, connection, transaction } = setup();
    client.getDataFeed.mockRejectedValueOnce(new Error("feed unavailable"));

    await expect(updatePiyologDataFeed({ client, transaction })).rejects.toThrow("feed unavailable");
    expect(connection.begin).not.toHaveBeenCalled();
  });

  it("rolls back when insertion fails after deletion", async () => {
    const { client, tx, transaction } = setup();
    const error = new Error("insert failed");
    tx.execute.mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);

    await expect(updatePiyologDataFeed({ client, transaction })).rejects.toBe(error);
    expect(tx.execute).toHaveBeenCalledTimes(2);
    expect(tx.commit).not.toHaveBeenCalled();
    expect(tx.rollback).toHaveBeenCalledOnce();
  });

  it("does not report success when commit fails after saving", async () => {
    const { client, tx, transaction } = setup();
    tx.commit.mockRejectedValueOnce(new Error("commit failed"));

    await expect(updatePiyologDataFeed({ client, transaction })).rejects.toThrow("commit failed");
    expect(tx.execute).toHaveBeenCalledTimes(2);
    expect(tx.rollback).toHaveBeenCalledOnce();
  });
});
