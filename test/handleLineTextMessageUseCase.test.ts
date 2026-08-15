import { describe, expect, it, vi } from "vitest";
import { handleLineTextMessage } from "../src/application/handleLineTextMessageUseCase";
import type { LineMessagingClientInterface } from "../src/domain/lineMessagingClientInterface";

describe("handleLineTextMessage", () => {
  it("passes the LINE text to the assistant and replies with the assistant text", async () => {
    const askAssistant = vi.fn(async () => ({
      ok: true,
      text: "昨日のミルク量は合計420mlです。",
    }));
    const lineMessagingClient = {
      replyText: vi.fn(async () => undefined),
    } satisfies LineMessagingClientInterface;

    await handleLineTextMessage({
      replyToken: "reply-token",
      text: "昨日のミルク量をまとめて",
      askAssistant,
      lineMessagingClient,
    });

    expect(askAssistant).toHaveBeenCalledWith("昨日のミルク量をまとめて");
    expect(lineMessagingClient.replyText).toHaveBeenCalledWith(
      "reply-token",
      "昨日のミルク量は合計420mlです。",
    );
  });
});
