import { describe, expect, it, vi } from "vitest";
import { handleLineWebhookRequest } from "../src/controller/lineController";

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

  it("passes text message events to the injected handler through waitUntil", async () => {
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
    const waitUntil = vi.fn();

    const response = await handleLineWebhookRequest(
      new Request("https://example.com/api/line/webhook", {
        method: "POST",
        headers: { "x-line-signature": await signBody(body, "line-secret") },
        body,
      }),
      dependencies({ handleTextMessage, waitUntil }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(handleTextMessage).toHaveBeenCalledWith({
      replyToken: "reply-token",
      text: "昨日のミルク量をまとめて",
    });
  });

  it("acknowledges the webhook before the text message handler resolves", async () => {
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
    let resolveHandler: () => void = () => undefined;
    const handlerPromise = new Promise<void>((resolve) => {
      resolveHandler = resolve;
    });
    const handleTextMessage = vi.fn(() => handlerPromise);
    const waitUntil = vi.fn();

    const responsePromise = handleLineWebhookRequest(
      new Request("https://example.com/api/line/webhook", {
        method: "POST",
        headers: { "x-line-signature": await signBody(body, "line-secret") },
        body,
      }),
      dependencies({ handleTextMessage, waitUntil }),
    );

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(handleTextMessage).toHaveBeenCalledOnce();

    resolveHandler();
    await handlerPromise;
  });

  it("logs text message handler failures from waitUntil and still acknowledges the webhook", async () => {
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
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const waitUntilTasks: Promise<void>[] = [];

    try {
      const response = await handleLineWebhookRequest(
        new Request("https://example.com/api/line/webhook", {
          method: "POST",
          headers: { "x-line-signature": await signBody(body, "line-secret") },
          body,
        }),
        dependencies({
          waitUntil: (task) => {
            waitUntilTasks.push(task);
          },
          handleTextMessage: async () => {
            throw new Error("handler unavailable");
          },
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(waitUntilTasks).toHaveLength(1);
      await waitUntilTasks[0];
      expect(consoleError).toHaveBeenCalledWith("Failed to handle LINE text message", {
        name: "Error",
        message: "handler unavailable",
      });
    } finally {
      consoleError.mockRestore();
    }
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
    waitUntil: () => undefined,
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
