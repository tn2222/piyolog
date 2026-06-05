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
  SLACK_COMMAND_TOKEN: "slack-token",
  PERSONAL_LLM_GATEWAY_URL: "https://llm.example.com",
  PERSONAL_LLM_GATEWAY_TOKEN: "gateway-token",
};

const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
} satisfies ExecutionContext;

describe("worker entrypoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockResolvedValue({ lastInsertId: "123" });
  });

  it("returns 404 JSON for unknown paths", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/unknown"),
      env,
      ctx,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "not_found" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("does not create a repository for non-POST text record requests", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/text-records?token=secret-token", {
        method: "GET",
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ ok: false, error: "method_not_allowed" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("does not create a repository for unauthorized text record requests", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/text-records?token=wrong", {
        method: "POST",
        body: "{}",
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("creates a repository for valid text record requests", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/text-records?token=secret-token", {
        method: "POST",
        body: JSON.stringify({
          text: "2026/5/22(金)\n赤ちゃん (0か月16日)\n01:00   ミルク 40ml",
        }),
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 123, events: 1 });
    expect(connect).toHaveBeenCalledWith({
      url: "mysql://example",
      fullResult: true,
    });
  });

  it("resolves Secrets Store bindings before handling text record requests", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/text-records?token=store-secret-token", {
        method: "POST",
        body: JSON.stringify({
          text: "2026/5/22(金)\n赤ちゃん (0か月16日)\n01:00   ミルク 40ml",
        }),
      }),
      {
        INGEST_TOKEN: secretBinding("store-secret-token"),
        DATABASE_URL: secretBinding("mysql://store-example"),
        SLACK_COMMAND_TOKEN: secretBinding("store-slack-token"),
        PERSONAL_LLM_GATEWAY_URL: secretBinding("https://llm.store.example.com"),
        PERSONAL_LLM_GATEWAY_TOKEN: secretBinding("store-gateway-token"),
      },
      ctx,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 123, events: 1 });
    expect(connect).toHaveBeenCalledWith({
      url: "mysql://store-example",
      fullResult: true,
    });
  });

  it("routes custom action capture requests to the repository", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/api/custom-action-captures?token=secret-token", {
        method: "POST",
        body: JSON.stringify({
          baby: {
            nickname: "赤ちゃん",
            sex: "Female",
            dateOfBirth: { year: 2026, month: 5, day: 6 },
          },
          days: [
            {
              date: { year: 2026, month: 6, day: 1 },
              journal: "今日はよく寝た",
            },
          ],
        }),
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, diaries: 1 });
    expect(connect).toHaveBeenCalledWith({
      url: "mysql://example",
      fullResult: true,
    });
  });

  it("routes Slack slash commands to the assistant", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/tool-selection")) {
        return new Response(
          JSON.stringify({
            toolName: "compare_metric",
            arguments: {
              metric: "milk_amount",
              currentRange: { from: "2026-05-24", to: "2026-05-31" },
              previousRange: { from: "2026-05-17", to: "2026-05-24" },
              aggregation: "sum",
              groupBy: "none",
            },
          }),
        );
      }
      return new Response(JSON.stringify({ text: "今週はミルク量が増えています。" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    execute.mockResolvedValue({ lastInsertId: null, rows: [] });

    try {
      const response = await worker.fetch(
        new Request("https://example.com/api/slack/commands", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            token: "slack-token",
            text: "先週と比べてミルク量増えた？",
          }),
        }),
        env,
        ctx,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        response_type: "ephemeral",
        text: "今週はミルク量が増えています。",
      });
      expect(connect).toHaveBeenCalledWith({
        url: "mysql://example",
        fullResult: true,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });
});

function secretBinding(value: string) {
  return {
    async get() {
      return value;
    },
  };
}
