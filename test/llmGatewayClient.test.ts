import { describe, expect, it, vi } from "vitest";
import { HttpLlmGatewayClient } from "../src/infrastructure/externalService/llmGatewayClient";
import { parseBabyLogToolCall } from "../src/domain/tools";

describe("HttpLlmGatewayClient", () => {
  it("requests tool selection with bearer authorization", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          type: "tool_call",
          toolName: "compare_metric",
          arguments: {
            metric: "milk_amount",
            currentRange: { from: "2026-05-24", to: "2026-05-31" },
            previousRange: { from: "2026-05-17", to: "2026-05-24" },
            aggregation: "sum",
            groupBy: "none",
          },
        }),
      ),
    );
    const client = new HttpLlmGatewayClient({
      baseUrl: "https://llm.example.com/",
      token: "gateway-token",
      fetch: fetchMock,
    });

    const result = parseBabyLogToolCall(await client.selectTool({
      app: "piyolog",
      task: "tool_selection",
      modelPolicy: "fast",
      userText: "先週と比べてミルク量増えた？",
      tools: [{ name: "compare_metric", description: "compare", parameters: {} }],
      timezone: "Asia/Tokyo",
      now: "2026-06-03T08:15:30+09:00",
    }));

    expect(result.toolName).toBe("compare_metric");
    expect(fetchMock).toHaveBeenCalledWith("https://llm.example.com/v1/tool-selection", {
      method: "POST",
      headers: {
        authorization: "Bearer gateway-token",
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        app: "piyolog",
        task: "tool_selection",
        modelPolicy: "fast",
        userText: "先週と比べてミルク量増えた？",
        tools: [{ name: "compare_metric", description: "compare", parameters: {} }],
        timezone: "Asia/Tokyo",
        now: "2026-06-03T08:15:30+09:00",
      }),
    });
  });

  it("requests answer generation with tool results", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ text: "今週はミルク量が増えています。" })),
    );
    const client = new HttpLlmGatewayClient({
      baseUrl: "https://llm.example.com",
      token: "gateway-token",
      fetch: fetchMock,
    });

    const result = await client.generateAnswer({
      app: "piyolog",
      task: "answer_generation",
      modelPolicy: "balanced",
      userText: "先週と比べてミルク量増えた？",
      toolResults: [{ toolName: "compare_metric", result: { rows: [] } }],
      instructions: "記録に基づいて回答する。",
    });

    expect(result).toEqual({ text: "今週はミルク量が増えています。" });
    expect(fetchMock).toHaveBeenCalledWith("https://llm.example.com/v1/generate", {
      method: "POST",
      headers: {
        authorization: "Bearer gateway-token",
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        app: "piyolog",
        task: "answer_generation",
        modelPolicy: "balanced",
        userText: "先週と比べてミルク量増えた？",
        toolResults: [{ toolName: "compare_metric", result: { rows: [] } }],
        instructions: "記録に基づいて回答する。",
      }),
    });
  });

  it("throws when the LLM Gateway returns a non-2xx response", async () => {
    const fetchMock = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    const client = new HttpLlmGatewayClient({
      baseUrl: "https://llm.example.com",
      token: "gateway-token",
      fetch: fetchMock,
    });

    await expect(
      client.generateAnswer({
        app: "piyolog",
        task: "answer_generation",
        modelPolicy: "balanced",
        userText: "hello",
        toolResults: [],
        instructions: "answer",
      }),
    ).rejects.toThrow("LLM Gateway request failed");
  });

  it("includes the gateway path when fetch fails", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const client = new HttpLlmGatewayClient({
      baseUrl: "https://llm.example.com",
      token: "gateway-token",
      fetch: fetchMock,
    });

    await expect(
      client.selectTool({
        app: "piyolog",
        task: "tool_selection",
        modelPolicy: "fast",
        userText: "昨日の育児ログのサマリーをして",
        tools: [],
        timezone: "Asia/Tokyo",
        now: "2026-06-03T09:30:00+09:00",
      }),
    ).rejects.toThrow("LLM Gateway fetch failed: /v1/tool-selection: Failed to fetch");
  });

  it("does not call fetch with the client instance as this", async () => {
    const fetchMock = vi.fn(function (this: unknown) {
      if (this instanceof HttpLlmGatewayClient) {
        throw new TypeError("Illegal invocation");
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            toolName: "summarize_period",
            arguments: {
              range: { from: "2026-06-02", to: "2026-06-03" },
              granularity: "day",
              includeMetrics: ["event_count"],
            },
          }),
        ),
      );
    });
    const client = new HttpLlmGatewayClient({
      baseUrl: "https://llm.example.com",
      token: "gateway-token",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.selectTool({
        app: "piyolog",
        task: "tool_selection",
        modelPolicy: "fast",
        userText: "昨日の育児ログのサマリーをして",
        tools: [],
        timezone: "Asia/Tokyo",
        now: "2026-06-03T09:30:00+09:00",
      }),
    ).resolves.toEqual({
      toolName: "summarize_period",
      arguments: {
        range: { from: "2026-06-02", to: "2026-06-03" },
        granularity: "day",
        includeMetrics: ["event_count"],
      },
    });
  });
});
