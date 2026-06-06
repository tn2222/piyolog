import { describe, expect, it, vi } from "vitest";
import { handleLineWebhookRequest } from "../src/gateway/lineController";

describe("handleLineWebhookRequest", () => {
  it("rejects non-POST requests", async () => {
    const response = await handleLineWebhookRequest(
      new Request("https://example.com/api/line/webhook", { method: "GET" }),
      dependencies(),
    );

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: "method_not_allowed" });
  });

  it("rejects missing signatures", async () => {
    const body = JSON.stringify({ destination: "Uxxxxxxxx", events: [] });

    const response = await handleLineWebhookRequest(
      new Request("https://example.com/api/line/webhook", {
        method: "POST",
        body,
      }),
      dependencies(),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects invalid signatures", async () => {
    const body = JSON.stringify({ destination: "Uxxxxxxxx", events: [] });

    const response = await handleLineWebhookRequest(
      new Request("https://example.com/api/line/webhook", {
        method: "POST",
        headers: { "x-line-signature": "invalid" },
        body,
      }),
      dependencies(),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects invalid JSON after signature verification", async () => {
    const body = "{";

    const response = await handleLineWebhookRequest(
      new Request("https://example.com/api/line/webhook", {
        method: "POST",
        headers: { "x-line-signature": await signBody(body, "line-secret") },
        body,
      }),
      dependencies(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
  });

  it("accepts empty events for LINE Console verification", async () => {
    const body = JSON.stringify({ destination: "Uxxxxxxxx", events: [] });
    const handleTextMessage = vi.fn();

    const response = await handleLineWebhookRequest(
      new Request("https://example.com/api/line/webhook", {
        method: "POST",
        headers: { "x-line-signature": await signBody(body, "line-secret") },
        body,
      }),
      dependencies({ handleTextMessage }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(handleTextMessage).not.toHaveBeenCalled();
  });

  it("extracts text message events", async () => {
    const body = JSON.stringify({
      destination: "Uxxxxxxxx",
      events: [
        {
          type: "message",
          replyToken: "reply-token",
          message: {
            type: "text",
            id: "message-id",
            text: "昨日のミルク量をまとめて",
          },
        },
      ],
    });
    const handleTextMessage = vi.fn();

    const response = await handleLineWebhookRequest(
      new Request("https://example.com/api/line/webhook", {
        method: "POST",
        headers: { "x-line-signature": await signBody(body, "line-secret") },
        body,
      }),
      dependencies({ handleTextMessage }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(handleTextMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      text: "昨日のミルク量をまとめて",
    });
  });

  it("ignores non-text message events", async () => {
    const body = JSON.stringify({
      destination: "Uxxxxxxxx",
      events: [
        {
          type: "message",
          replyToken: "reply-token",
          message: { type: "sticker", id: "message-id" },
        },
      ],
    });
    const handleTextMessage = vi.fn();

    const response = await handleLineWebhookRequest(
      new Request("https://example.com/api/line/webhook", {
        method: "POST",
        headers: { "x-line-signature": await signBody(body, "line-secret") },
        body,
      }),
      dependencies({ handleTextMessage }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(handleTextMessage).not.toHaveBeenCalled();
  });
});

function dependencies(
  overrides: Partial<Parameters<typeof handleLineWebhookRequest>[1]> = {},
): Parameters<typeof handleLineWebhookRequest>[1] {
  return {
    lineChannelSecret: "line-secret",
    handleTextMessage: () => undefined,
    ...overrides,
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
