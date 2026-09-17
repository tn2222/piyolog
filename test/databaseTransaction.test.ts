import { describe, expect, it, vi } from "vitest";
import { DatabaseTransaction } from "../src/infrastructure/transaction/databaseTransaction";

function createTransactionConnection() {
  return {
    execute: vi.fn(async (_sql: string) => ({})),
    commit: vi.fn(async () => ({})),
    rollback: vi.fn(async () => ({})),
  };
}

function setup() {
  const tx = createTransactionConnection();
  const connection = { begin: vi.fn(async () => tx), execute: vi.fn() };
  return { tx, connection, transaction: new DatabaseTransaction(connection) };
}

describe("DatabaseTransaction", () => {
  it("passes the connection from begin to the callback and commits after completion", async () => {
    const { tx, connection, transaction } = setup();
    await transaction.run(async (activeConnection) => {
      expect(activeConnection).toBe(tx);
      await activeConnection.execute("INSERT INTO events VALUES (?)", [1]);
      expect(tx.commit).not.toHaveBeenCalled();
    });

    expect(connection.begin).toHaveBeenCalledOnce();
    expect(connection.execute).not.toHaveBeenCalled();
    expect(tx.execute).toHaveBeenCalledExactlyOnceWith("INSERT INTO events VALUES (?)", [1]);
    expect(tx.commit).toHaveBeenCalledOnce();
    expect(tx.rollback).not.toHaveBeenCalled();
  });

  it("uses the new transaction connection on every run", async () => {
    const { tx, connection, transaction } = setup();
    const nextTx = createTransactionConnection();
    connection.begin.mockResolvedValueOnce(tx).mockResolvedValueOnce(nextTx);

    await transaction.run(async (activeConnection) => {
      await activeConnection.execute("INSERT INTO events VALUES (?)", [1]);
    });
    await transaction.run(async (activeConnection) => {
      await activeConnection.execute("INSERT INTO events VALUES (?)", [2]);
    });

    expect(tx.execute).toHaveBeenCalledExactlyOnceWith("INSERT INTO events VALUES (?)", [1]);
    expect(nextTx.execute).toHaveBeenCalledExactlyOnceWith("INSERT INTO events VALUES (?)", [2]);
    expect(tx.commit).toHaveBeenCalledOnce();
    expect(nextTx.commit).toHaveBeenCalledOnce();
  });

  it("rolls back SQL failures and preserves the error", async () => {
    const { tx, transaction } = setup();
    const error = new Error("insert failed");
    tx.execute.mockRejectedValueOnce(error);

    await expect(transaction.run(async (connection) => {
      await connection.execute("INSERT INTO events VALUES (?)", [1]);
    })).rejects.toBe(error);
    expect(tx.rollback).toHaveBeenCalledOnce();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("rolls back callback failures even after SQL succeeds", async () => {
    const { tx, transaction } = setup();
    const error = new Error("callback failed");
    await expect(transaction.run(async (connection) => {
      await connection.execute("INSERT INTO events VALUES (?)", [1]);
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

    await expect(transaction.run(async () => {})).rejects.toBe(error);
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
