import { askAssistant } from "./application/askAssistantUseCase";
import { handleLineTextMessage } from "./application/handleLineTextMessageUseCase";
import { handleLineWebhookRequest } from "./controller/lineController";
import { HttpLlmGatewayClient } from "./gateway/llmGatewayClient";
import { handleMcpRequest } from "./gateway/mcpController";
import { handleSlackCommandRequest } from "./gateway/slackController";
import { createTiDBSummaryPeriodQueryService } from "./gateway/summaryPeriodQueryService";
import { handleCustomActionCaptureRequest, handleTextRecordsRequest } from "./handler";
import { HttpLineMessagingClient } from "./infrastructure/externalService/lineMessagingClient";
import { createTiDBPiyologRepository } from "./repository";
import { resolveSecrets } from "./secrets";
import type { Env } from "./types";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/mcp") {
      return handleMcpRequest(request);
    }

    if (
      url.pathname !== "/api/slack/commands" &&
      url.pathname !== "/api/line/webhook" &&
      url.pathname !== "/api/custom-action-captures" &&
      url.pathname !== "/api/text-records"
    ) {
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
        status: 404,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      });
    }

    const resolvedEnv = await resolveSecrets(env);

    if (url.pathname === "/api/slack/commands") {
      return handleSlackCommandRequest(request, {
        slackCommandToken: resolvedEnv.SLACK_COMMAND_TOKEN,
        waitUntil: (task) => ctx.waitUntil(task),
        askAssistant: (text) =>
          askAssistant({
            text,
            timezone: "Asia/Tokyo",
            repository: createTiDBPiyologRepository(resolvedEnv.DATABASE_URL),
            summaryPeriodQueryService: createTiDBSummaryPeriodQueryService(
              resolvedEnv.DATABASE_URL,
            ),
            llmGateway: new HttpLlmGatewayClient({
              baseUrl: resolvedEnv.PERSONAL_LLM_GATEWAY_URL,
              token: resolvedEnv.PERSONAL_LLM_GATEWAY_TOKEN,
            }),
          }),
      });
    }

    if (url.pathname === "/api/line/webhook") {
      return handleLineWebhookRequest(request, {
        lineChannelSecret: resolvedEnv.LINE_CHANNEL_SECRET,
        waitUntil: (task) => ctx.waitUntil(task),
        handleTextMessage: ({ replyToken, text }) =>
          handleLineTextMessage({
            replyToken,
            text,
            askAssistant: (messageText) =>
              askAssistant({
                text: messageText,
                timezone: "Asia/Tokyo",
                repository: createTiDBPiyologRepository(resolvedEnv.DATABASE_URL),
                summaryPeriodQueryService: createTiDBSummaryPeriodQueryService(
                  resolvedEnv.DATABASE_URL,
                ),
                llmGateway: new HttpLlmGatewayClient({
                  baseUrl: resolvedEnv.PERSONAL_LLM_GATEWAY_URL,
                  token: resolvedEnv.PERSONAL_LLM_GATEWAY_TOKEN,
                }),
              }),
            lineMessagingClient: new HttpLineMessagingClient({
              channelAccessToken: resolvedEnv.LINE_CHANNEL_ACCESS_TOKEN,
            }),
          }),
      });
    }

    if (url.pathname === "/api/custom-action-captures") {
      return handleCustomActionCaptureRequest(request, resolvedEnv, () =>
        createTiDBPiyologRepository(resolvedEnv.DATABASE_URL),
      );
    }

    return handleTextRecordsRequest(request, resolvedEnv, () =>
      createTiDBPiyologRepository(resolvedEnv.DATABASE_URL),
    );
  },
};
