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
