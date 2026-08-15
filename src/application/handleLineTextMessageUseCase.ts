import type { LineMessagingClientInterface } from "../domain/lineMessagingClientInterface";
import type { AskAssistantResult } from "./askAssistantUseCase";

export type HandleLineTextMessageInput = {
  replyToken: string;
  text: string;
  askAssistant(text: string): Promise<AskAssistantResult>;
  lineMessagingClient: LineMessagingClientInterface;
};

export async function handleLineTextMessage(
  input: HandleLineTextMessageInput,
): Promise<void> {
  const result = await input.askAssistant(input.text);
  await input.lineMessagingClient.replyText(input.replyToken, result.text);
}
