import { describe, expect, it } from "vitest";
import { handleSlackCommandRequest } from "../src/gateway/slackController";

describe("handleSlackCommandRequest", () => {
  it("rejects non-POST requests", async () => {
    const response = await handleSlackCommandRequest(
      new Request("https://example.com/api/slack/commands", { method: "GET" }),
      {
        slackCommandToken: "slack-token",
        askAssistant: async () => ({ ok: true, text: "unreachable" }),
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
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      response_type: "ephemeral",
      text: "今週はミルク量が増えています。",
    });
    expect(calls).toEqual(["先週と比べてミルク量増えた？"]);
  });
});
