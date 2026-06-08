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
  LINE_CHANNEL_SECRET: "line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-access-token",
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
        LINE_CHANNEL_SECRET: secretBinding("store-line-secret"),
        LINE_CHANNEL_ACCESS_TOKEN: secretBinding("store-line-access-token"),
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

  it("lists the ping_piyolog MCP tool without resolving secrets", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: [
          {
            name: "ping_piyolog",
            title: "Ping piyolog",
            description: "Return pong to verify ChatGPT can call the piyolog MCP server.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            outputSchema: {
              type: "object",
              properties: {
                message: { type: "string" },
              },
              required: ["message"],
              additionalProperties: false,
            },
          },
        ],
      },
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it("initializes the minimal piyolog MCP server", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "chatgpt", version: "test" },
          },
        }),
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: 3,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "piyolog-mcp",
          version: "0.1.0",
        },
        instructions:
          "Use ping_piyolog only to verify that ChatGPT can reach the piyolog MCP server.",
      },
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it("returns pong from the ping_piyolog MCP tool", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "ping_piyolog",
            arguments: {},
          },
        }),
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: {
        structuredContent: { message: "pong" },
        content: [{ type: "text", text: "pong" }],
      },
    });
    expect(connect).not.toHaveBeenCalled();
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

  it("routes LINE webhooks to the assistant and replies to LINE", async () => {
    const originalFetch = globalThis.fetch;
    const waitUntilTasks: Promise<void>[] = [];
    const lineCtx = {
      ...ctx,
      waitUntil: vi.fn((task: Promise<void>) => {
        waitUntilTasks.push(task);
      }),
    } satisfies ExecutionContext;
    const body = JSON.stringify({
      destination: "Uxxxxxxxx",
      events: [
        {
          type: "message",
          replyToken: "line-reply-token",
          message: {
            type: "text",
            id: "message-id",
            text: "昨日のミルク量をまとめて",
          },
        },
      ],
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/tool-selection")) {
        return new Response(
          JSON.stringify({
            toolName: "compare_metric",
            arguments: {
              metric: "milk_amount",
              currentRange: { from: "2026-06-06", to: "2026-06-07" },
              previousRange: { from: "2026-06-05", to: "2026-06-06" },
              aggregation: "sum",
              groupBy: "none",
            },
          }),
        );
      }
      if (url.endsWith("/v1/generate")) {
        return new Response(JSON.stringify({ text: "昨日のミルク量は合計420mlです。" }));
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    execute.mockResolvedValue({ lastInsertId: null, rows: [] });

    try {
      const response = await worker.fetch(
        new Request("https://example.com/api/line/webhook", {
          method: "POST",
          headers: { "x-line-signature": await signBody(body, "line-secret") },
          body,
        }),
        env,
        lineCtx,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(lineCtx.waitUntil).toHaveBeenCalledOnce();
      expect(fetchMock).not.toHaveBeenCalledWith(
        "https://api.line.me/v2/bot/message/reply",
        expect.anything(),
      );
      expect(waitUntilTasks).toHaveLength(1);
      await waitUntilTasks[0];
      expect(connect).toHaveBeenCalledWith({
        url: "mysql://example",
        fullResult: true,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.line.me/v2/bot/message/reply",
        {
          method: "POST",
          headers: {
            authorization: "Bearer line-access-token",
            "content-type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            replyToken: "line-reply-token",
            messages: [{ type: "text", text: "昨日のミルク量は合計420mlです。" }],
          }),
        },
      );
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

async function signBody(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
