import { describe, expect, it, vi } from "vitest";
import { handleRecordsRequest } from "../src/handler";
import type { RawPayloadInput, RawPayloadRepository, TextExportInput } from "../src/types";

class MemoryRepository implements RawPayloadRepository {
  public inserted: RawPayloadInput[] = [];
  public insertedTextExports: TextExportInput[] = [];
  public replacedEventDates: string[][] = [];
  public insertedEvents: Array<{ rawPayloadId: number; events: unknown[] }> = [];

  async insert(input: RawPayloadInput) {
    this.inserted.push(input);
    return { id: 123 };
  }

  async insertTextExport(input: TextExportInput) {
    this.insertedTextExports.push(input);
    return { id: 456 };
  }

  async insertEvents(rawPayloadId: number, events: unknown[]) {
    this.insertedEvents.push({ rawPayloadId, events });
  }

  async deleteEventsByDates(eventDates: string[]) {
    this.replacedEventDates.push(eventDates);
  }
}

const env = {
  INGEST_TOKEN: "secret-token",
  DATABASE_URL: "mysql://example",
};

describe("handleRecordsRequest", () => {
  it("rejects non-POST requests", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "GET",
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ ok: false, error: "method_not_allowed" });
    expect(repository.inserted).toHaveLength(0);
  });

  it("rejects missing token", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records", {
      method: "POST",
      body: "{}",
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(repository.inserted).toHaveLength(0);
  });

  it("rejects invalid token", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=wrong", {
      method: "POST",
      body: "{}",
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(repository.inserted).toHaveLength(0);
  });

  it("rejects invalid JSON", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "POST",
      body: "{not-json",
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_json" });
    expect(repository.inserted).toHaveLength(0);
  });

  it("saves valid JSON with request metadata", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
        "user-agent": "Piyolog Custom Action",
      },
      body: JSON.stringify({ records: [{ type: "milk", amount: 50 }] }),
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 123 });
    expect(repository.inserted).toEqual([
      {
        sourceIp: "203.0.113.10",
        userAgent: "Piyolog Custom Action",
        payload: { records: [{ type: "milk", amount: 50 }] },
      },
    ]);
    expect(repository.insertedEvents).toEqual([]);
  });

  it("saves parsed Piyolog events after saving the raw payload", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "POST",
      body: JSON.stringify({
        baby: { nickname: "凛ちゃん" },
        days: [
          {
            date: { year: 2026, month: 5, day: 21 },
            events: [
              {
                hour: 14,
                minute: 5,
                type: "Formula",
                value: { unit: "ml", value: 60 },
              },
            ],
          },
        ],
      }),
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(200);
    expect(repository.replacedEventDates).toEqual([["2026-05-21"]]);
    expect(repository.insertedEvents).toEqual([
      {
        rawPayloadId: 123,
        events: [
          {
            babyNickname: "凛ちゃん",
            eventDate: "2026-05-21",
            occurredAt: "2026-05-21 14:05:00",
            eventType: "Formula",
            amountValue: 60,
            amountUnit: "ml",
            leftSeconds: null,
            rightSeconds: null,
            lastSide: null,
            rawEvent: {
              hour: 14,
              minute: 5,
              type: "Formula",
              value: { unit: "ml", value: 60 },
            },
          },
        ],
      },
    ]);
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
          "凛ちゃん (0か月16日)",
          "",
          "01:00   ミルク 40ml",
          "02:00   うんち (黄色)",
        ].join("\n"),
      }),
    });

    const response = await handleRecordsRequest(request, env, () => repository);

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
          "凛ちゃん (0か月16日)",
          "",
          "01:00   ミルク 40ml",
          "02:00   うんち (黄色)",
        ].join("\n"),
      },
    ]);
    expect(repository.replacedEventDates).toEqual([["2026-05-22"]]);
    expect(repository.insertedEvents).toEqual([
      {
        rawPayloadId: 456,
        events: [
          {
            babyNickname: "凛ちゃん",
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
            babyNickname: "凛ちゃん",
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

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_json" });
    expect(repository.insertedTextExports).toEqual([]);
  });

  it("replaces parsed Piyolog events for all dates included in the payload", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "POST",
      body: JSON.stringify({
        days: [
          {
            date: { year: 2026, month: 5, day: 20 },
            events: [{ hour: 10, minute: 0, type: "Poop" }],
          },
          {
            date: { year: 2026, month: 5, day: 21 },
            events: [
              { hour: 4, minute: 30, type: "Formula", value: { unit: "ml", value: 50 } },
              { hour: 10, minute: 0, type: "Poop" },
            ],
          },
          {
            date: { year: 2026, month: 5, day: 21 },
            events: [{ hour: 11, minute: 0, type: "Pee" }],
          },
        ],
      }),
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(200);
    expect(repository.replacedEventDates).toEqual([["2026-05-20", "2026-05-21"]]);
    expect(repository.insertedEvents).toHaveLength(1);
    expect(repository.insertedEvents[0]?.events).toHaveLength(4);
  });

  it("deletes existing normalized events for received days even when a day has no events", async () => {
    const repository = new MemoryRepository();
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "POST",
      body: JSON.stringify({
        days: [
          {
            date: { year: 2026, month: 5, day: 20 },
            events: [],
          },
        ],
      }),
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(200);
    expect(repository.replacedEventDates).toEqual([["2026-05-20"]]);
    expect(repository.insertedEvents).toEqual([]);
  });

  it("returns 500 when persistence fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository: RawPayloadRepository = {
      async insert() {
        throw new Error("database unavailable");
      },
      async insertTextExport() {
        throw new Error("unreachable");
      },
      async deleteEventsByDates() {
        throw new Error("unreachable");
      },
      async insertEvents() {
        throw new Error("unreachable");
      },
    };
    const request = new Request("https://example.com/api/records?token=secret-token", {
      method: "POST",
      body: JSON.stringify({ records: [] }),
    });

    const response = await handleRecordsRequest(request, env, () => repository);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "internal_error" });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
