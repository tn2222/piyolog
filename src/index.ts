import { askAssistant } from "./application/askAssistantUseCase";
import { handleLineTextMessage } from "./application/handleLineTextMessageUseCase";
import { handleLineWebhookRequest } from "./controller/lineController";
import { handleMcpRequest } from "./controller/mcpController";
import { handleSlackCommandRequest } from "./controller/slackController";
import { handleCustomActionCaptureRequest, handleTextRecordsRequest } from "./handler";
import { HttpLlmGatewayClient } from "./infrastructure/externalService/llmGatewayClient";
import { HttpLineMessagingClient } from "./infrastructure/externalService/lineMessagingClient";
import { createTiDBSummaryPeriodQueryService } from "./infrastructure/queryService/summaryPeriodQueryService";
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
      return handleMcpRequest(request, {
        createSummaryPeriodQueryService: async () => {
          const resolvedEnv = await resolveSecrets(env);
          return createTiDBSummaryPeriodQueryService(resolvedEnv.DATABASE_URL);
        },
        isReadAuthorized: async (mcpRequest) => {
          const token = new URL(mcpRequest.url).searchParams.get("token");
          if (token === null) {
            return false;
          }
          const resolvedEnv = await resolveSecrets(env);
          return token === resolvedEnv.INGEST_TOKEN;
        },
      });
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
