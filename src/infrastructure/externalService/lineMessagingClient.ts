import type { LineMessagingClientInterface } from "../../application/handleLineTextMessageUseCase";

type HttpLineMessagingClientInput = {
  channelAccessToken: string;
  fetch?: typeof fetch;
};

const lineReplyEndpoint = "https://api.line.me/v2/bot/message/reply";

export class HttpLineMessagingClient implements LineMessagingClientInterface {
  private readonly channelAccessToken: string;
  private readonly fetch: typeof fetch;

  constructor(input: HttpLineMessagingClientInput) {
    this.channelAccessToken = input.channelAccessToken;
    this.fetch = input.fetch ?? ((request, init) => fetch(request, init));
  }

  async replyText(replyToken: string, text: string): Promise<void> {
    const response = await this.fetch(lineReplyEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.channelAccessToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    });

    if (!response.ok) {
      throw new Error(`LINE reply API failed with status ${response.status}`);
    }
  }
}
