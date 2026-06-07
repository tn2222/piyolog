import { describe, expect, it, vi } from "vitest";
import { HttpLineMessagingClient } from "../src/infrastructure/externalService/lineMessagingClient";

describe("HttpLineMessagingClient", () => {
  it("replies with a LINE text message", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const client = new HttpLineMessagingClient({
      channelAccessToken: "line-access-token",
      fetch: fetchMock,
    });

    await client.replyText("reply-token", "昨日のミルク量は合計420mlです。");

    expect(fetchMock).toHaveBeenCalledWith("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        authorization: "Bearer line-access-token",
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        replyToken: "reply-token",
        messages: [{ type: "text", text: "昨日のミルク量は合計420mlです。" }],
      }),
    });
  });

  it("raises an error when the LINE reply API fails", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
    const client = new HttpLineMessagingClient({
      channelAccessToken: "line-access-token",
      fetch: fetchMock,
    });

    await expect(client.replyText("reply-token", "reply text")).rejects.toThrow(
      "LINE reply API failed with status 500",
    );
  });
});
