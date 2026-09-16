import { describe, expect, it } from "vitest";
import {
  parsePiyologFeedSnapshot,
  PiyologFeedValidationError,
} from "../src/domain/piyologFeed";

const validRecord = {
  event_id: "record",
  datetime: "2026-09-16T00:00:00.000Z",
  type: "Formula",
};

describe("parsePiyologFeedSnapshot", () => {
  it("accepts an empty snapshot and canonicalizes UTC timestamps", () => {
    const snapshot = parsePiyologFeedSnapshot({
      schema_version: 1,
      generated_at: "2026-09-16T05:18:54Z",
      range: {
        from: "2026-09-15T05:18:54.2Z",
        to: "2026-09-16T05:18:54.000Z",
      },
      records: [],
    });

    expect(snapshot).toEqual({
      schemaVersion: 1,
      generatedAt: "2026-09-16T05:18:54.000Z",
      range: {
        from: "2026-09-15T05:18:54.200Z",
        to: "2026-09-16T05:18:54.000Z",
      },
      records: [],
    });
  });

  it("includes range.from and excludes range.to", () => {
    const snapshot = parsePiyologFeedSnapshot({
      schema_version: 1,
      generated_at: "2026-09-16T01:00:00.000Z",
      range: {
        from: "2026-09-16T00:00:00.000Z",
        to: "2026-09-16T01:00:00.000Z",
      },
      records: [
        { event_id: "at-start", datetime: "2026-09-16T00:00:00Z", type: "Pee" },
      ],
    });

    expect(snapshot.records[0]?.eventId).toBe("at-start");
    expect(() =>
      parsePiyologFeedSnapshot({
        schema_version: 1,
        generated_at: "2026-09-16T01:00:00.000Z",
        range: {
          from: "2026-09-16T00:00:00.000Z",
          to: "2026-09-16T01:00:00.000Z",
        },
        records: [
          { event_id: "at-end", datetime: "2026-09-16T01:00:00Z", type: "Pee" },
        ],
      }),
    ).toThrow(PiyologFeedValidationError);
  });

  it("maps optional values and poop details while preserving unknown records", () => {
    const rawRecord = {
      event_id: "unknown",
      datetime: "2026-09-16T00:00:00.123Z",
      type: "NewType",
      custom: { keep: true },
    };
    const snapshot = parsePiyologFeedSnapshot({
      schema_version: 1,
      generated_at: "2026-09-16T01:00:00.000Z",
      range: {
        from: "2026-09-16T00:00:00.000Z",
        to: "2026-09-16T01:00:00.000Z",
      },
      records: [
        {
          event_id: "feeding",
          datetime: "2026-09-16T00:00:00.123Z",
          type: "BreastFeeding",
          last: "right",
          leftTime: 600.125,
          rightTime: 369.8703520298,
        },
        {
          event_id: "formula",
          datetime: "2026-09-16T00:10:00Z",
          type: "Formula",
          value: { value: 60.5, unit: "ml" },
        },
        {
          event_id: "poop",
          datetime: "2026-09-16T00:20:00Z",
          type: "Poop",
          details: { amount: "small", hardness: "normal", color: "yellow" },
        },
        rawRecord,
      ],
    });

    expect(snapshot.records[0]).toMatchObject({
      last: "right",
      leftTime: 600.125,
      rightTime: 369.8703520298,
      value: null,
      details: null,
    });
    expect(snapshot.records[1]?.value).toEqual({
      value: 60.5,
      unit: "ml",
      left: null,
      right: null,
    });
    expect(snapshot.records[2]?.details).toEqual({
      amount: "small",
      hardness: "normal",
      color: "yellow",
    });
    expect(snapshot.records[3]?.rawRecord).toBe(rawRecord);
  });

  it("turns omitted optional fields into null", () => {
    const snapshot = parsePiyologFeedSnapshot({
      schema_version: 1,
      generated_at: "2026-09-16T01:00:00.000Z",
      range: {
        from: "2026-09-16T00:00:00.000Z",
        to: "2026-09-16T01:00:00.000Z",
      },
      records: [{ event_id: "pee", datetime: "2026-09-16T00:00:00Z", type: "Pee" }],
    });

    expect(snapshot.records[0]).toMatchObject({
      last: null,
      leftTime: null,
      rightTime: null,
      value: null,
      details: null,
    });
  });

  it.each<[string, Record<string, unknown>]>([
    ["unsupported schema", { schema_version: 2 }],
    [
      "duplicate IDs",
      {
        records: [
          { ...validRecord, event_id: "same" },
          { ...validRecord, event_id: "same" },
        ],
      },
    ],
    [
      "out of range",
      { records: [{ ...validRecord, event_id: "late", datetime: "2026-09-16T01:00:00Z" }] },
    ],
    [
      "malformed value",
      { records: [{ ...validRecord, value: { value: "60", unit: "ml" } }] },
    ],
    ["missing value unit", { records: [{ ...validRecord, value: { value: 60 } }] }],
    [
      "zero value",
      { records: [{ ...validRecord, value: { value: 0, unit: "ml" } }] },
    ],
    ["generated_at mismatch", { generated_at: "2026-09-16T00:59:59Z" }],
  ])("rejects %s", (_name, overrides) => {
    const payload = {
      schema_version: 1,
      generated_at: "2026-09-16T01:00:00.000Z",
      range: {
        from: "2026-09-16T00:00:00.000Z",
        to: "2026-09-16T01:00:00.000Z",
      },
      records: [],
      ...overrides,
    };

    if (overrides.schema_version === 2) {
      expect(() => parsePiyologFeedSnapshot(payload)).toThrow(PiyologFeedValidationError);
      return;
    }

    const records = overrides.records ?? payload.records;
    expect(() => parsePiyologFeedSnapshot({ ...payload, records })).toThrow(
      PiyologFeedValidationError,
    );
  });
});
