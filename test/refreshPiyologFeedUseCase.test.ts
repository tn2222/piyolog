import { describe, expect, it, vi } from "vitest";
import { parsePiyologFeedSnapshot } from "../src/domain/piyologFeed";
import { refreshPiyologFeed } from "../src/application/refreshPiyologFeedUseCase";

describe("refreshPiyologFeed", () => {
  it("passes the fetched snapshot to the projection and returns its status", async () => {
    const snapshot = parsePiyologFeedSnapshot({
      schema_version: 1,
      generated_at: "2026-09-16T01:00:00.000Z",
      range: {
        from: "2026-09-16T00:00:00.000Z",
        to: "2026-09-16T01:00:00.000Z",
      },
      records: [],
    });
    const source = {
      getSnapshot: vi.fn(async () => snapshot),
    };
    const projection = {
      apply: vi.fn(async () => ({
        status: "applied" as const,
        generatedAt: snapshot.generatedAt,
        range: snapshot.range,
        recordCount: 0,
      })),
    };

    await expect(refreshPiyologFeed({ source, projection })).resolves.toMatchObject({
      status: "applied",
    });
    expect(source.getSnapshot).toHaveBeenCalledOnce();
    expect(projection.apply).toHaveBeenCalledWith(snapshot);
  });

  it("does not call the projection when fetching fails", async () => {
    const source = {
      getSnapshot: vi.fn(async () => {
        throw new Error("feed unavailable");
      }),
    };
    const projection = { apply: vi.fn() };

    await expect(refreshPiyologFeed({ source, projection })).rejects.toThrow("feed unavailable");
    expect(projection.apply).not.toHaveBeenCalled();
  });
});
