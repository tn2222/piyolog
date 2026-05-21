import { describe, expect, it, vi } from "vitest";
import { handleRecordsRequest } from "../src/handler";
import type { RawPayloadInput, RawPayloadRepository } from "../src/types";

class MemoryRepository implements RawPayloadRepository {
  public inserted: RawPayloadInput[] = [];

  async insert(input: RawPayloadInput) {
    this.inserted.push(input);
    return { id: 123 };
  }
}

const env = {
  INGEST_TOKEN: "secret-token",
  DATABASE_URL: "mysql://example",
};

describe("handleRecordsRequest", () => {
  it("rejects non-POST requests", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "GET",
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ ok: false, error: "method_not_allowed" });
    expect(repository.inserted).toHaveLength(0);
  });

  it("rejects missing token", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records", {
      method: "POST",
      body: "{}",
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(repository.inserted).toHaveLength(0);
  });

  it("rejects invalid token", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=wrong", {
      method: "POST",
      body: "{}",
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(repository.inserted).toHaveLength(0);
  });

  it("rejects invalid JSON", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "POST",
      body: "{not-json",
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_json" });
    expect(repository.inserted).toHaveLength(0);
  });

  it("saves valid JSON with request metadata", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
        "user-agent": "Piyolog Custom Action",
      },
      body: JSON.stringify({ records: [{ type: "milk", amount: 50 }] }),
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 123 });
    expect(repository.inserted).toEqual([
      {
        sourceIp: "203.0.113.10",
        userAgent: "Piyolog Custom Action",
        payload: { records: [{ type: "milk", amount: 50 }] },
      },
    ]);
  });

  it("returns 500 when persistence fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository: RawPayloadRepository = {
      async insert() {
        throw new Error("database unavailable");
      },
    };
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "POST",
      body: JSON.stringify({ records: [] }),
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "internal_error" });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
