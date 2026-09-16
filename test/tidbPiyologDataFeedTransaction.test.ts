import { describe, expect, it, vi } from "vitest";
import { parsePiyologDataFeedSnapshot } from "../src/domain/piyologDataFeed";
import { TiDBPiyologDataFeedTransaction } from "../src/infrastructure/transaction/tidbPiyologDataFeedTransaction";

const snapshot = parsePiyologDataFeedSnapshot({
  schema_version: 1,
  generated_at: "2026-09-16T01:00:00.000Z",
  range: { from: "2026-09-16T00:00:00.000Z", to: "2026-09-16T01:00:00.000Z" },
  records: [{ event_id: "formula", datetime: "2026-09-16T00:30:00.000Z", type: "Formula" }],
});

function setup() {
  const tx = {
    execute: vi.fn(async (_sql: string) => ({})),
    commit: vi.fn(async () => ({})),
    rollback: vi.fn(async () => ({})),
  };
  const connection = { begin: vi.fn(async () => tx), execute: vi.fn() };
  return { tx, connection, transaction: new TiDBPiyologDataFeedTransaction(connection) };
}

describe("TiDBPiyologDataFeedTransaction", () => {
  it("runs repository queries on the transaction connection and commits after the callback", async () => {
    const { tx, connection, transaction } = setup();
    await transaction.run(async (repository) => {
      await repository.replaceRange(snapshot);
      expect(tx.commit).not.toHaveBeenCalled();
    });

    expect(connection.begin).toHaveBeenCalledOnce();
    expect(connection.execute).not.toHaveBeenCalled();
    expect(tx.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("DELETE FROM"), expect.any(Array));
    expect(tx.execute).toHaveBeenNthCalledWith(2, expect.stringContaining("INSERT INTO"), expect.any(Array));
    expect(tx.commit).toHaveBeenCalledOnce();
    expect(tx.rollback).not.toHaveBeenCalled();
  });

  it("rolls back when insertion fails after deletion", async () => {
    const { tx, transaction } = setup();
    const error = new Error("insert failed");
    tx.execute.mockResolvedValueOnce({}).mockRejectedValueOnce(error);

    await expect(transaction.run((repository) => repository.replaceRange(snapshot))).rejects.toBe(error);
    expect(tx.execute).toHaveBeenCalledTimes(2);
    expect(tx.rollback).toHaveBeenCalledOnce();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("rolls back callback failures even after repository writes succeed", async () => {
    const { tx, transaction } = setup();
    const error = new Error("callback failed");
    await expect(transaction.run(async (repository) => {
      await repository.replaceRange(snapshot);
      throw error;
    })).rejects.toBe(error);
    expect(tx.rollback).toHaveBeenCalledOnce();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("attempts rollback when commit fails and preserves the original error if rollback also fails", async () => {
    const { tx, transaction } = setup();
    const error = new Error("commit failed");
    tx.commit.mockRejectedValueOnce(error);
    tx.rollback.mockRejectedValueOnce(new Error("rollback failed"));

    await expect(transaction.run((repository) => repository.replaceRange(snapshot))).rejects.toBe(error);
    expect(tx.rollback).toHaveBeenCalledOnce();
  });

  it("does not invoke the callback when beginning a transaction fails", async () => {
    const { tx, connection, transaction } = setup();
    const error = new Error("begin failed");
    connection.begin.mockRejectedValueOnce(error);
    const work = vi.fn();

    await expect(transaction.run(work)).rejects.toBe(error);
    expect(work).not.toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
    expect(tx.rollback).not.toHaveBeenCalled();
  });
});
