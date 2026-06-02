import { describe, expect, it, vi } from "vitest";
import { HttpLlmGatewayClient } from "../src/gateway/llmGatewayClient";
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
});
