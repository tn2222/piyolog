import { getRecentBabyLogs } from "../application/getRecentBabyLogsUseCase";
import { calculateDateRangeDays, parseDateRange, type DateRange } from "../domain/periods";
import type { SummaryPeriodQueryServiceInterface } from "../types";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: JsonRpcId;
  method?: unknown;
  params?: unknown;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

type McpRequestOptions = {
  createSummaryPeriodQueryService(): Promise<SummaryPeriodQueryServiceInterface>;
  isReadAuthorized(request: Request): Promise<boolean>;
};

const pingPiyologTool = {
  name: "ping_piyolog",
  title: "Ping piyolog",
  description: "Return pong to verify ChatGPT can call the piyolog MCP server.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
    },
    required: ["message"],
    additionalProperties: false,
  },
};

const getRecentBabyLogsTool = {
  name: "get_recent_baby_logs",
  title: "Get recent baby logs",
  description:
    "Get recent piyolog baby logs and diary journals for a bounded date range. Use this before answering questions about recent feeding, sleep, diaper, crying, or daily rhythm records.",
  inputSchema: {
    type: "object",
    properties: {
      from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      includeDiaries: { type: "boolean" },
      eventTypes: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["from", "to"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      range: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
      days: { type: "array" },
    },
    required: ["range", "days"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
  },
};

export async function handleMcpRequest(
  request: Request,
  options: McpRequestOptions,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  let payload: JsonRpcRequest;
  try {
    payload = (await request.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  if (payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
    return jsonRpcError(payload.id ?? null, -32600, "Invalid Request");
  }

  switch (payload.method) {
    case "initialize":
      return jsonRpcResult(payload.id ?? null, {
        protocolVersion: requestedProtocolVersion(payload.params),
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "piyolog-mcp",
          version: "0.1.0",
        },
        instructions: (await options.isReadAuthorized(request))
          ? "Use ping_piyolog to verify connectivity. Use get_recent_baby_logs to read recent piyolog baby logs and diary journals before answering questions about recent feeding, sleep, diaper, crying, or daily rhythm records."
          : "Use ping_piyolog only to verify that ChatGPT can reach the piyolog MCP server.",
      });
    case "notifications/initialized":
      return new Response(null, { status: 202, headers: corsHeaders() });
    case "tools/list":
      return jsonRpcResult(payload.id ?? null, {
        tools: (await options.isReadAuthorized(request))
          ? [pingPiyologTool, getRecentBabyLogsTool]
          : [pingPiyologTool],
      });
    case "tools/call":
      return handleToolCall(payload, request, options);
    default:
      return jsonRpcError(payload.id ?? null, -32601, "Method not found");
  }
}

async function handleToolCall(
  payload: JsonRpcRequest,
  request: Request,
  options: McpRequestOptions,
): Promise<Response> {
  const params = payload.params;
  if (!isRecord(params) || typeof params.name !== "string") {
    return jsonRpcError(payload.id ?? null, -32602, "Unknown tool");
  }

  if (params.name === "ping_piyolog") {
    return jsonRpcResult(payload.id ?? null, {
      structuredContent: { message: "pong" },
      content: [{ type: "text", text: "pong" }],
    });
  }

  if (params.name === "get_recent_baby_logs") {
    if (!(await options.isReadAuthorized(request))) {
      return jsonRpcError(payload.id ?? null, -32001, "Unauthorized read tool call");
    }
    return handleGetRecentBabyLogsCall(payload.id ?? null, params.arguments, options);
  }

  return jsonRpcError(payload.id ?? null, -32602, "Unknown tool");
}

async function handleGetRecentBabyLogsCall(
  id: JsonRpcId,
  rawArguments: unknown,
  options: McpRequestOptions,
): Promise<Response> {
  const parsedArguments = parseGetRecentBabyLogsArguments(rawArguments);
  if (parsedArguments === null) {
    return jsonRpcError(id, -32602, "Invalid get_recent_baby_logs arguments");
  }

  const result = await getRecentBabyLogs({
    ...parsedArguments,
    summaryPeriodQueryService: await options.createSummaryPeriodQueryService(),
  });

  return jsonRpcResult(id, {
    structuredContent: result,
    content: [
      {
        type: "text",
        text: `${result.range.from} から ${result.range.to} までの育児ログを${result.days.length}日分取得しました。`,
      },
    ],
  });
}

function parseGetRecentBabyLogsArguments(input: unknown): {
  range: DateRange;
  includeDiaries: boolean;
  eventTypes: string[] | null;
} | null {
  if (!isRecord(input)) {
    return null;
  }

  const range = parseDateRange({
    from: input.from,
    to: input.to,
  });
  if (range === null || calculateDateRangeDays(range) > 35) {
    return null;
  }

  const eventTypes = parseEventTypes(input.eventTypes);
  if (eventTypes === undefined) {
    return null;
  }

  return {
    range,
    includeDiaries:
      typeof input.includeDiaries === "boolean" ? input.includeDiaries : true,
    eventTypes,
  };
}

function parseEventTypes(input: unknown): string[] | null | undefined {
  if (input === undefined) {
    return null;
  }
  if (!Array.isArray(input)) {
    return undefined;
  }

  const eventTypes = input.filter((value) => typeof value === "string");
  if (eventTypes.length !== input.length) {
    return undefined;
  }

  return [...new Set(eventTypes)];
}

function requestedProtocolVersion(params: unknown): string {
  if (isRecord(params) && typeof params.protocolVersion === "string") {
    return params.protocolVersion;
  }

  return "2025-06-18";
}

function jsonRpcResult(id: JsonRpcId, result: unknown): Response {
  return jsonResponse({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: JsonRpcId, code: number, message: string): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...jsonHeaders,
      ...corsHeaders(),
    },
  });
}

function corsHeaders(): HeadersInit {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
