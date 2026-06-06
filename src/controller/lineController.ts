export type LineTextMessage = {
  replyToken: string;
  text: string;
};

type LineWebhookDependencies = {
  lineChannelSecret: string;
  handleTextMessage(message: LineTextMessage): void | Promise<void>;
};

type LineWebhookPayload = {
  events?: unknown[];
};

type LineTextMessageEvent = {
  type: "message";
  replyToken: string;
  message: {
    type: "text";
    text: string;
  };
};

export async function handleLineWebhookRequest(
  request: Request,
  dependencies: LineWebhookDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const body = await request.text();
  const signature = request.headers.get("x-line-signature");
  const verified =
    typeof signature === "string" &&
    (await verifyLineSignature(body, signature, dependencies.lineChannelSecret));

  if (!verified) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let payload: LineWebhookPayload;
  try {
    payload = JSON.parse(body) as LineWebhookPayload;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  for (const event of events) {
    if (!isLineTextMessageEvent(event)) {
      continue;
    }

    try {
      await dependencies.handleTextMessage({
        replyToken: event.replyToken,
        text: event.message.text,
      });
    } catch (error) {
      console.error("Failed to handle LINE text message", summarizeError(error));
    }
  }

  return jsonResponse({ ok: true }, 200);
}

async function verifyLineSignature(
  body: string,
  signature: string,
  channelSecret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(digest)));

  return timingSafeEqual(expectedSignature, signature);
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }

  return difference === 0;
}

function isLineTextMessageEvent(event: unknown): event is LineTextMessageEvent {
  if (!isRecord(event) || event.type !== "message") {
    return false;
  }

  const message = event.message;
  return (
    typeof event.replyToken === "string" &&
    isRecord(message) &&
    message.type === "text" &&
    typeof message.text === "string"
  );
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function summarizeError(error: unknown): { name: string; message: string } {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  };
}
