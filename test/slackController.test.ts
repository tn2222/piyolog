import { describe, expect, it, vi } from "vitest";
import { handleSlackCommandRequest } from "../src/controller/slackController";

describe("handleSlackCommandRequest", () => {
  it("rejects non-POST requests", async () => {
    const response = await handleSlackCommandRequest(
      new Request("https://example.com/api/slack/commands", { method: "GET" }),
      {
        slackCommandToken: "slack-token",
        askAssistant: async () => ({ ok: true, text: "unreachable" }),
        waitUntil: () => undefined,
      },
    );

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: "method_not_allowed" });
  });

  it("rejects invalid Slack command tokens", async () => {
    const response = await handleSlackCommandRequest(
      new Request("https://example.com/api/slack/commands", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: "wrong",
          text: "昨日のまとめ",
        }),
      }),
      {
        slackCommandToken: "slack-token",
        askAssistant: async () => ({ ok: true, text: "unreachable" }),
        waitUntil: () => undefined,
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("passes slash command text to the assistant use case", async () => {
    const calls: string[] = [];
    const response = await handleSlackCommandRequest(
      new Request("https://example.com/api/slack/commands", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: "slack-token",
          text: "先週と比べてミルク量増えた？",
        }),
      }),
      {
        slackCommandToken: "slack-token",
        askAssistant: async (text) => {
          calls.push(text);
          return { ok: true, text: "今週はミルク量が増えています。" };
        },
        waitUntil: () => undefined,
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      response_type: "ephemeral",
      text: "今週はミルク量が増えています。",
    });
    expect(calls).toEqual(["先週と比べてミルク量増えた？"]);
  });

  it("acknowledges slash commands immediately and posts the answer later", async () => {
    const backgroundTasks: Promise<void>[] = [];
    const fetchMock = vi.fn(async () => new Response("ok"));
    let resolveAssistant: (value: { ok: true; text: string }) => void = () => undefined;
    const assistantResult = new Promise<{ ok: true; text: string }>((resolve) => {
      resolveAssistant = resolve;
    });

    const response = await handleSlackCommandRequest(
      new Request("https://example.com/api/slack/commands", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: "slack-token",
          text: "昨日の育児ログのサマリーをして",
          response_url: "https://hooks.slack.com/commands/response",
        }),
      }),
      {
        slackCommandToken: "slack-token",
        askAssistant: () => assistantResult,
        waitUntil: (task) => backgroundTasks.push(task),
        fetch: fetchMock,
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      response_type: "ephemeral",
      text: "育児ログを確認しています。少し待ってください。",
    });
    expect(fetchMock).not.toHaveBeenCalled();

    resolveAssistant({
      ok: true,
      text: "昨日はミルクが合計115mlで、うんちは3回記録されています。",
    });
    await Promise.all(backgroundTasks);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/commands/response",
      {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          response_type: "ephemeral",
          text: "昨日はミルクが合計115mlで、うんちは3回記録されています。",
        }),
      },
    );
  });
});
