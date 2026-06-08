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

export async function handleMcpRequest(request: Request): Promise<Response> {
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
        instructions:
          "Use ping_piyolog only to verify that ChatGPT can reach the piyolog MCP server.",
      });
    case "notifications/initialized":
      return new Response(null, { status: 202, headers: corsHeaders() });
    case "tools/list":
      return jsonRpcResult(payload.id ?? null, {
        tools: [pingPiyologTool],
      });
    case "tools/call":
      return handleToolCall(payload);
    default:
      return jsonRpcError(payload.id ?? null, -32601, "Method not found");
  }
}

function handleToolCall(payload: JsonRpcRequest): Response {
  const params = payload.params;
  if (!isRecord(params) || params.name !== "ping_piyolog") {
    return jsonRpcError(payload.id ?? null, -32602, "Unknown tool");
  }

  return jsonRpcResult(payload.id ?? null, {
    structuredContent: { message: "pong" },
    content: [{ type: "text", text: "pong" }],
  });
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
