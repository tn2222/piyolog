import { describe, expect, it, vi } from "vitest";
import {
  HttpPiyologDataFeedSource,
  PiyologDataFeedSourceError,
} from "../src/infrastructure/externalService/piyologDataFeedSource";
import { PiyologDataFeedValidationError } from "../src/domain/piyologDataFeed";

const url = "https://feed.piyolog.com/v1/feed/24h/feed-id/feed-secret";

describe("HttpPiyologDataFeedSource", () => {
  it("fetches and validates a snapshot", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(validPayload())));
    const source = new HttpPiyologDataFeedSource({
      url,
      fetch: fetchMock,
    });

    await expect(source.getSnapshot()).resolves.toMatchObject({
      generatedAt: "2026-09-16T01:00:00.000Z",
      records: [{ eventId: "event-1" }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: "GET",
        headers: { accept: "application/json" },
      }),
    );
  });

  it("retries 429 and 5xx responses with injectable backoff", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(validPayload())));
    const sleepMock = vi.fn(async () => {});
    const source = new HttpPiyologDataFeedSource({
      url,
      fetch: fetchMock,
      sleep: sleepMock,
      random: () => 0,
      maxAttempts: 3,
    });

    await expect(source.getSnapshot()).resolves.toMatchObject({ records: [{ eventId: "event-1" }] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepMock).toHaveBeenNthCalledWith(1, 500);
    expect(sleepMock).toHaveBeenNthCalledWith(2, 1_000);
  });

  it("retries a network failure before succeeding", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(new Response(JSON.stringify(validPayload())));
    const sleepMock = vi.fn(async () => {});
    const source = new HttpPiyologDataFeedSource({
      url,
      fetch: fetchMock,
      sleep: sleepMock,
      random: () => 0,
      maxAttempts: 2,
    });

    await expect(source.getSnapshot()).resolves.toMatchObject({
      records: [{ eventId: "event-1" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(500);
  });

  it("does not retry non-retryable HTTP errors", async () => {
    const fetchMock = vi.fn(async () => new Response("missing", { status: 404 }));
    const sleepMock = vi.fn(async () => {});
    const source = new HttpPiyologDataFeedSource({ url, fetch: fetchMock, sleep: sleepMock });

    await expect(source.getSnapshot()).rejects.toMatchObject({
      name: "PiyologDataFeedSourceError",
      code: "http_error",
      status: 404,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("does not expose the configured URL in request errors", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error(`request failed for ${url}`);
    });
    const source = new HttpPiyologDataFeedSource({ url, fetch: fetchMock, maxAttempts: 1 });

    const error = await source.getSnapshot().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(PiyologDataFeedSourceError);
    expect(String(error)).not.toContain(url);
  });

  it("rejects malformed JSON and invalid snapshots", async () => {
    const invalidJsonSource = new HttpPiyologDataFeedSource({
      url,
      fetch: vi.fn(async () => new Response("{")),
    });
    await expect(invalidJsonSource.getSnapshot()).rejects.toMatchObject({ code: "invalid_json" });

    const invalidSnapshotSource = new HttpPiyologDataFeedSource({
      url,
      fetch: vi.fn(async () => new Response(JSON.stringify({ schema_version: 2 }))),
    });
    await expect(invalidSnapshotSource.getSnapshot()).rejects.toBeInstanceOf(
      PiyologDataFeedValidationError,
    );
  });
});

function validPayload() {
  return {
    schema_version: 1,
    generated_at: "2026-09-16T01:00:00.000Z",
    range: {
      from: "2026-09-16T00:00:00.000Z",
      to: "2026-09-16T01:00:00.000Z",
    },
    records: [
      {
        event_id: "event-1",
        datetime: "2026-09-16T00:00:00.000Z",
        type: "Formula",
        value: { value: 60, unit: "ml" },
      },
    ],
  };
}
