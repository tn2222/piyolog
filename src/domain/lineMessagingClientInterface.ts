export type LineMessagingClientInterface = {
  replyText(replyToken: string, text: string): Promise<void>;
};
