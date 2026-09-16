import { describe, expect, it, vi } from "vitest";
import { parsePiyologDataFeedSnapshot } from "../src/domain/piyologDataFeed";
import { updatePiyologDataFeed } from "../src/application/updatePiyologDataFeedUseCase";

describe("updatePiyologDataFeed", () => {
  it("passes the fetched snapshot to the projection and returns its status", async () => {
    const snapshot = parsePiyologDataFeedSnapshot({
      schema_version: 1,
      generated_at: "2026-09-16T01:00:00.000Z",
      range: {
        from: "2026-09-16T00:00:00.000Z",
        to: "2026-09-16T01:00:00.000Z",
      },
      records: [],
    });
    const source = {
      getDataFeed: vi.fn(async () => snapshot),
    };
    const projection = {
      apply: vi.fn(async () => ({
        generatedAt: snapshot.generatedAt,
        range: snapshot.range,
        recordCount: 0,
      })),
    };

    await expect(updatePiyologDataFeed({ source, projection })).resolves.toEqual({
      generatedAt: snapshot.generatedAt,
      range: snapshot.range,
      recordCount: 0,
    });
    expect(source.getDataFeed).toHaveBeenCalledOnce();
    expect(projection.apply).toHaveBeenCalledWith(snapshot);
  });

  it("does not call the projection when fetching fails", async () => {
    const source = {
      getDataFeed: vi.fn(async () => {
        throw new Error("feed unavailable");
      }),
    };
    const projection = { apply: vi.fn() };

    await expect(updatePiyologDataFeed({ source, projection })).rejects.toThrow("feed unavailable");
    expect(projection.apply).not.toHaveBeenCalled();
  });
});
