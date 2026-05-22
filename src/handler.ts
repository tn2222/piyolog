import type { Env, RawPayloadRepositoryFactory } from "./types";
import { parsePiyologEventDates, parsePiyologEvents } from "./piyolog";
import { parsePiyologTextEventDates, parsePiyologTextEvents } from "./piyologText";

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
    const url = new URL(request.url);

    if (url.pathname === "/api/text-records") {
      const input = parseTextExportRequest(payload);
      if (input === null) {
        return jsonResponse({ ok: false, error: "invalid_json" satisfies ErrorCode }, 400);
      }

      const eventDates = parsePiyologTextEventDates(input.text);
      const events = parsePiyologTextEvents(input.text);
      const result = await repository.insertTextExport({
        ...input,
        sourceIp: request.headers.get("cf-connecting-ip"),
        userAgent: request.headers.get("user-agent"),
      });

      if (result.id !== null && eventDates.length > 0) {
        await repository.deleteEventsByDates(eventDates);
      }

      if (result.id !== null && events.length > 0) {
        await repository.insertEvents(result.id, events);
      }

      return jsonResponse({ ok: true, id: result.id, events: events.length }, 200);
    }

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

function parseTextExportRequest(payload: unknown): {
  source: string;
  fileId: string | null;
  fileName: string | null;
  updatedAt: string | null;
  text: string;
} | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.text !== "string" || record.text.trim().length === 0) {
    return null;
  }

  return {
    source: typeof record.source === "string" ? record.source : "google_drive_text_export",
    fileId: typeof record.fileId === "string" ? record.fileId : null,
    fileName: typeof record.fileName === "string" ? record.fileName : null,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
    text: record.text,
  };
}
