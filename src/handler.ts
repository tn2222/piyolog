import type { Env, PiyologDiaryInput, PiyologRepositoryFactory } from "./types";
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

export async function handleTextRecordsRequest(
  request: Request,
  env: Env,
  createRepository: PiyologRepositoryFactory,
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
  } catch (error) {
    console.error("Failed to insert Piyolog text export", summarizeError(error));
    return jsonResponse({ ok: false, error: "internal_error" satisfies ErrorCode }, 500);
  }
}

export async function handleCustomActionCaptureRequest(
  request: Request,
  env: Env,
  createRepository: PiyologRepositoryFactory,
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
    const diaries = parseCustomActionDiaries(payload);

    if (diaries.length > 0) {
      await repository.upsertDiaries(diaries);
    }

    return jsonResponse({ ok: true, diaries: diaries.length }, 200);
  } catch (error) {
    console.error("Failed to capture Piyolog custom action payload", summarizeError(error));
    return jsonResponse({ ok: false, error: "internal_error" satisfies ErrorCode }, 500);
  }
}

function parseCustomActionDiaries(payload: unknown): PiyologDiaryInput[] {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const baby = parseBaby(record.baby);
  if (!Array.isArray(record.days)) {
    return [];
  }

  return record.days.flatMap((day) => {
    const diary = parseDiaryDay(day, baby);
    return diary === null ? [] : [diary];
  });
}

function parseBaby(input: unknown): {
  nickname: string | null;
  dateOfBirth: string | null;
  sex: string | null;
} {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      nickname: null,
      dateOfBirth: null,
      sex: null,
    };
  }

  const record = input as Record<string, unknown>;
  return {
    nickname: typeof record.nickname === "string" ? record.nickname : null,
    dateOfBirth: parseDateObject(record.dateOfBirth),
    sex: typeof record.sex === "string" ? record.sex : null,
  };
}

function parseDiaryDay(
  input: unknown,
  baby: {
    nickname: string | null;
    dateOfBirth: string | null;
    sex: string | null;
  },
): PiyologDiaryInput | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const entryDate = parseDateObject(record.date);
  if (entryDate === null || typeof record.journal !== "string") {
    return null;
  }

  return {
    babyNickname: baby.nickname,
    babyDateOfBirth: baby.dateOfBirth,
    babySex: baby.sex,
    entryDate,
    journal: record.journal,
    rawDay: record,
  };
}

function parseDateObject(input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  if (
    !Number.isInteger(record.year) ||
    !Number.isInteger(record.month) ||
    !Number.isInteger(record.day)
  ) {
    return null;
  }

  const year = Number(record.year);
  const month = Number(record.month);
  const day = Number(record.day);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
