import { describe, expect, it, vi } from "vitest";
import {
  parsePiyologDataFeedSnapshot,
  type PiyologDataFeedRepository,
} from "../src/domain/piyologDataFeed";
import { updatePiyologDataFeed } from "../src/application/updatePiyologDataFeedUseCase";

const snapshot = parsePiyologDataFeedSnapshot({
  schema_version: 1,
  generated_at: "2026-09-16T01:00:00.000Z",
  range: { from: "2026-09-16T00:00:00.000Z", to: "2026-09-16T01:00:00.000Z" },
  records: [],
});

describe("updatePiyologDataFeed", () => {
  it("fetches before starting the transaction and returns after it completes", async () => {
    const steps: string[] = [];
    const client = {
      getDataFeed: vi.fn(async () => {
        steps.push("fetch");
        return snapshot;
      }),
    };
    const repository = {
      replaceRange: vi.fn(async () => { steps.push("replace"); }),
    };
    const transaction = {
      run: async (work: (repository: PiyologDataFeedRepository) => Promise<void>) => {
        steps.push("begin");
        await work(repository);
        steps.push("commit");
      },
    };

    await expect(updatePiyologDataFeed({ client, transaction })).resolves.toEqual({
      generatedAt: snapshot.generatedAt,
      range: snapshot.range,
      recordCount: 0,
    });
    expect(steps).toEqual(["fetch", "begin", "replace", "commit"]);
    expect(repository.replaceRange).toHaveBeenCalledWith(snapshot);
  });

  it("does not start a transaction when fetching fails", async () => {
    const client = { getDataFeed: vi.fn(async () => { throw new Error("feed unavailable"); }) };
    const transaction = { run: vi.fn() };

    await expect(updatePiyologDataFeed({ client, transaction })).rejects.toThrow("feed unavailable");
    expect(transaction.run).not.toHaveBeenCalled();
  });

  it("does not report success when the transaction fails after saving", async () => {
    const client = { getDataFeed: vi.fn(async () => snapshot) };
    const repository = { replaceRange: vi.fn(async () => {}) };
    const transaction = {
      run: async (work: (repository: PiyologDataFeedRepository) => Promise<void>) => {
        await work(repository);
        throw new Error("commit failed");
      },
    };

    await expect(updatePiyologDataFeed({ client, transaction })).rejects.toThrow("commit failed");
    expect(repository.replaceRange).toHaveBeenCalledWith(snapshot);
  });
});
