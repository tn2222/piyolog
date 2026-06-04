import { describe, expect, it, vi } from "vitest";
import { handleCustomActionCaptureRequest, handleTextRecordsRequest } from "../src/handler";
import type {
  CompareMetricInput,
  PiyologEventInput,
  PiyologDiaryInput,
  PiyologRepositoryInterface,
  SummarizePeriodInput,
  TextExportInput,
} from "../src/types";

class MemoryRepository implements PiyologRepositoryInterface {
  public insertedTextExports: TextExportInput[] = [];
  public upsertedDiaries: PiyologDiaryInput[][] = [];
  public replacedEventDates: string[][] = [];
  public insertedEvents: Array<{ rawTextExportId: number; events: PiyologEventInput[] }> = [];

  async insertTextExport(input: TextExportInput) {
    this.insertedTextExports.push(input);
    return { id: 456 };
  }

  async upsertDiaries(diaries: PiyologDiaryInput[]) {
    this.upsertedDiaries.push(diaries);
  }

  async insertEvents(rawTextExportId: number, events: PiyologEventInput[]) {
    this.insertedEvents.push({ rawTextExportId, events });
  }

  async deleteEventsByDates(eventDates: string[]) {
    this.replacedEventDates.push(eventDates);
  }

  async compareMetric(input: CompareMetricInput) {
    return {
      metric: input.metric,
      currentRange: input.currentRange,
      previousRange: input.previousRange,
      rows: [],
    };
  }

  async summarizePeriod(input: SummarizePeriodInput) {
    return {
      range: input.range,
      granularity: input.granularity,
      days: [],
    };
  }
}

const env = {
  INGEST_TOKEN: "secret-token",
  DATABASE_URL: "mysql://example",
  SLACK_COMMAND_TOKEN: "slack-token",
  PERSONAL_LLM_GATEWAY_URL: "https://llm.example.com",
  PERSONAL_LLM_GATEWAY_TOKEN: "gateway-token",
};

describe("handleTextRecordsRequest", () => {
  it("rejects non-POST requests", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/text-records?token=secret-token", {
      method: "GET",
    });

    const response = await handleTextRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ ok: false, error: "method_not_allowed" });
    expect(repository.insertedTextExports).toHaveLength(0);
  });

  it("rejects missing token", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/text-records", {
      method: "POST",
      body: "{}",
    });

    const response = await handleTextRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(repository.insertedTextExports).toHaveLength(0);
  });

  it("rejects invalid token", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/text-records?token=wrong", {
      method: "POST",
      body: "{}",
    });

    const response = await handleTextRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(repository.insertedTextExports).toHaveLength(0);
  });

  it("rejects invalid JSON", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/text-records?token=secret-token", {
      method: "POST",
      body: "{not-json",
    });

    const response = await handleTextRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_json" });
    expect(repository.insertedTextExports).toHaveLength(0);
  });

  it("saves text exports and replaces normalized events for the included dates", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/text-records?token=secret-token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
        "user-agent": "Google-Apps-Script",
      },
      body: JSON.stringify({
        source: "google_drive_text_export",
        fileId: "drive-file-id",
        fileName: "piyolog-2026-05-22.txt",
        updatedAt: "2026-05-22T00:10:00.000Z",
        text: [
          "2026/5/22(金)",
          "赤ちゃん (0か月16日)",
          "",
          "01:00   ミルク 40ml",
          "02:00   うんち (黄色)",
        ].join("\n"),
      }),
    });

    const response = await handleTextRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 456, events: 2 });
    expect(repository.insertedTextExports).toEqual([
      {
        source: "google_drive_text_export",
        fileId: "drive-file-id",
        fileName: "piyolog-2026-05-22.txt",
        updatedAt: "2026-05-22T00:10:00.000Z",
        sourceIp: "203.0.113.10",
        userAgent: "Google-Apps-Script",
        text: [
          "2026/5/22(金)",
          "赤ちゃん (0か月16日)",
          "",
          "01:00   ミルク 40ml",
          "02:00   うんち (黄色)",
        ].join("\n"),
      },
    ]);
    expect(repository.replacedEventDates).toEqual([["2026-05-22"]]);
    expect(repository.insertedEvents).toEqual([
      {
        rawTextExportId: 456,
        events: [
          {
            babyNickname: "赤ちゃん",
            eventDate: "2026-05-22",
            occurredAt: "2026-05-22 01:00:00",
            eventType: "ミルク",
            amountValue: 40,
            amountUnit: "ml",
            leftSeconds: null,
            rightSeconds: null,
            lastSide: null,
            rawEvent: {
              source: "text_export",
              label: "ミルク",
              note: null,
              rawLine: "01:00   ミルク 40ml",
            },
          },
          {
            babyNickname: "赤ちゃん",
            eventDate: "2026-05-22",
            occurredAt: "2026-05-22 02:00:00",
            eventType: "うんち",
            amountValue: null,
            amountUnit: null,
            leftSeconds: null,
            rightSeconds: null,
            lastSide: null,
            rawEvent: {
              source: "text_export",
              label: "うんち",
              note: "黄色",
              rawLine: "02:00   うんち (黄色)",
            },
          },
        ],
      },
    ]);
  });

  it("rejects text export requests without text", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/text-records?token=secret-token", {
      method: "POST",
      body: JSON.stringify({ source: "google_drive_text_export" }),
    });

    const response = await handleTextRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_json" });
    expect(repository.insertedTextExports).toEqual([]);
  });

  it("deletes existing normalized events for received days even when a day has no events", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/text-records?token=secret-token", {
      method: "POST",
      body: JSON.stringify({
        text: ["2026/5/22(金)", "赤ちゃん (0か月16日)", "ミルク合計 0回 0ml"].join("\n"),
      }),
    });

    const response = await handleTextRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 456, events: 0 });
    expect(repository.replacedEventDates).toEqual([["2026-05-22"]]);
    expect(repository.insertedEvents).toEqual([]);
  });

  it("returns 500 when persistence fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository: PiyologRepositoryInterface = {
      async insertTextExport() {
        throw new Error("database unavailable");
      },
      async upsertDiaries() {
        throw new Error("unreachable");
      },
      async deleteEventsByDates() {
        throw new Error("unreachable");
      },
      async insertEvents() {
        throw new Error("unreachable");
      },
      async compareMetric() {
        throw new Error("unreachable");
      },
      async summarizePeriod() {
        throw new Error("unreachable");
      },
    };
    const request = new Request("https://example.com/api/text-records?token=secret-token", {
      method: "POST",
      body: JSON.stringify({ text: "2026/5/22(金)" }),
    });

    const response = await handleTextRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "internal_error" });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});

describe("handleCustomActionCaptureRequest", () => {
  it("rejects non-POST requests", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/custom-action-captures?token=secret-token", {
      method: "GET",
    });

    const response = await handleCustomActionCaptureRequest(request, env, () => repository);

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ ok: false, error: "method_not_allowed" });
    expect(repository.upsertedDiaries).toHaveLength(0);
  });

  it("rejects unauthorized requests", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/custom-action-captures?token=wrong", {
      method: "POST",
      body: "{}",
    });

    const response = await handleCustomActionCaptureRequest(request, env, () => repository);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(repository.upsertedDiaries).toHaveLength(0);
  });

  it("rejects invalid JSON", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/custom-action-captures?token=secret-token", {
      method: "POST",
      body: "{not-json",
    });

    const response = await handleCustomActionCaptureRequest(request, env, () => repository);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_json" });
    expect(repository.upsertedDiaries).toHaveLength(0);
  });

  it("upserts diary journals from custom action JSON", async () => {
    const repository = new MemoryRepository();
    const payload = {
      baby: {
        nickname: "赤ちゃん",
        sex: "Female",
        dateOfBirth: { year: 2026, month: 5, day: 6 },
      },
      days: [
        {
          date: { year: 2026, month: 6, day: 1 },
          events: [{ type: "Formula" }],
          journal: "今日はよく寝た",
        },
        {
          date: { year: 2026, month: 6, day: 2 },
          events: [],
          journal: "",
        },
      ],
    };
    const request = new Request("https://example.com/api/custom-action-captures?token=secret-token", {
      method: "POST",
      headers: {
        "cf-connecting-ip": "203.0.113.20",
        "user-agent": "PiyologCustomAction",
      },
      body: JSON.stringify(payload),
    });

    const response = await handleCustomActionCaptureRequest(request, env, () => repository);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, diaries: 2 });
    expect(repository.upsertedDiaries).toEqual([
      [
        {
          babyNickname: "赤ちゃん",
          babyDateOfBirth: "2026-05-06",
          babySex: "Female",
          entryDate: "2026-06-01",
          journal: "今日はよく寝た",
          rawDay: payload.days[0],
        },
        {
          babyNickname: "赤ちゃん",
          babyDateOfBirth: "2026-05-06",
          babySex: "Female",
          entryDate: "2026-06-02",
          journal: "",
          rawDay: payload.days[1],
        },
      ],
    ]);
  });
});
