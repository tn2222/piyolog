import { askAssistant } from "./application/askAssistantUseCase";
import { handleLineTextMessage } from "./application/handleLineTextMessageUseCase";
import { updatePiyologDataFeed } from "./application/updatePiyologDataFeedUseCase";
import { handleLineWebhookRequest } from "./controller/lineController";
import { handleMcpRequest } from "./controller/mcpController";
import { handleSlackCommandRequest } from "./controller/slackController";
import { handleCustomActionCaptureRequest, handleTextRecordsRequest } from "./handler";
import { HttpLlmGatewayClient } from "./infrastructure/externalService/llmGatewayClient";
import { HttpLineMessagingClient } from "./infrastructure/externalService/lineMessagingClient";
import { createPiyologDataFeedSource } from "./infrastructure/externalService/piyologDataFeedSource";
import { createTiDBSummaryPeriodQueryService } from "./infrastructure/queryService/summaryPeriodQueryService";
import { createTiDBPiyologDataFeedProjection } from "./infrastructure/repository/tidbPiyologDataFeedProjection";
import { createTiDBPiyologRepository } from "./repository";
import { resolvePiyologDataFeedSecrets, resolveSecrets } from "./secrets";
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

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    try {
      const feedEnv = await resolvePiyologDataFeedSecrets(env);
      const result = await updatePiyologDataFeed({
        source: createPiyologDataFeedSource({ url: feedEnv.PIYOLOG_FEED_URL }),
        projection: createTiDBPiyologDataFeedProjection(feedEnv.DATABASE_URL),
      });

      console.log("Piyolog data feed refresh completed", {
        generatedAt: result.generatedAt,
        rangeFrom: result.range.from,
        rangeTo: result.range.to,
        recordCount: result.recordCount,
      });
    } catch (error) {
      console.error("Piyolog data feed refresh failed", summarizeFeedError(error));
      throw error;
    }
  },
};

function summarizeFeedError(error: unknown): {
  errorClass: string;
  errorCode?: string;
  httpStatus?: number;
} {
  const summary: {
    errorClass: string;
    errorCode?: string;
    httpStatus?: number;
  } = {
    errorClass: error instanceof Error ? error.name : typeof error,
  };

  if (typeof error !== "object" || error === null) {
    return summary;
  }

  const errorCode = "code" in error ? error.code : undefined;
  if (typeof errorCode === "string") {
    summary.errorCode = errorCode;
  }

  const httpStatus = "status" in error ? error.status : undefined;
  if (typeof httpStatus === "number") {
    summary.httpStatus = httpStatus;
  }

  return summary;
}
