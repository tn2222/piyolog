import { connect } from "@tidbcloud/serverless";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const execute = vi.fn();

vi.mock("@tidbcloud/serverless", () => ({
  connect: vi.fn(() => ({
    execute,
  })),
}));

const env = {
  INGEST_TOKEN: "secret-token",
  DATABASE_URL: "mysql://example",
};

describe("worker entrypoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockResolvedValue({ lastInsertId: "123" });
  });

  it("returns 404 JSON for unknown paths", async () => {
    const response = await worker.fetch(new Request("https://example.com/unknown"), env);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "not_found" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("does not create a repository for non-POST records requests", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/records?token=secret-token", {
        method: "GET",
      }),
      env,
    );

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ ok: false, error: "method_not_allowed" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("does not create a repository for unauthorized records requests", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/records?token=wrong", {
        method: "POST",
        body: "{}",
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("creates a repository for valid records requests", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/records?token=secret-token", {
        method: "POST",
        body: JSON.stringify({ records: [] }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 123 });
    expect(connect).toHaveBeenCalledWith({
      url: "mysql://example",
      fullResult: true,
    });
  });
});
