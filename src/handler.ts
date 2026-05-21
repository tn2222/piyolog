import type { Env, RawPayloadRepositoryFactory } from "./types";
import { parsePiyologEventDates, parsePiyologEvents } from "./piyolog";

type ErrorCode =
  | "method_not_allowed"
  | "unauthorized"
  | "invalid_json"
  | "internal_error";

type ErrorSummary = {
  name: string;
  code?: string;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function summarizeError(error: unknown): ErrorSummary {
  const name = error instanceof Error ? error.name : typeof error;
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return { name };
  }

  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? { name, code } : { name };
}

export async function handleRecordsRequest(
  request: Request,
  env: Env,
  createRepository: RawPayloadRepositoryFactory,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" satisfies ErrorCode }, 405);
  }

  const url = new URL(request.url);
  if (url.searchParams.get("token") !== env.INGEST_TOKEN) {
    return jsonResponse({ ok: false, error: "unauthorized" satisfies ErrorCode }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" satisfies ErrorCode }, 400);
  }

  try {
    const repository = createRepository();
    const eventDates = parsePiyologEventDates(payload);
    const events = parsePiyologEvents(payload);
    const result = await repository.insert({
      sourceIp: request.headers.get("cf-connecting-ip"),
      userAgent: request.headers.get("user-agent"),
      payload,
    });

    if (result.id !== null && eventDates.length > 0) {
      await repository.deleteEventsByDates(eventDates);
    }

    if (result.id !== null && events.length > 0) {
      await repository.insertEvents(result.id, events);
    }

    return jsonResponse({ ok: true, id: result.id }, 200);
  } catch (error) {
    console.error("Failed to insert Piyolog raw payload", summarizeError(error));
    return jsonResponse({ ok: false, error: "internal_error" satisfies ErrorCode }, 500);
  }
}
