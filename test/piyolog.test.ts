import { describe, expect, it } from "vitest";
import { parsePiyologEvents } from "../src/piyolog";

describe("parsePiyologEvents", () => {
  it("extracts dated Piyolog events from captured payloads", () => {
    const events = parsePiyologEvents({
      baby: {
        nickname: "凛ちゃん",
      },
      days: [
        {
          date: { year: 2026, month: 5, day: 21 },
          events: [
            {
              hour: 4,
              minute: 30,
              type: "Formula",
              value: { unit: "ml", value: 50 },
            },
            {
              hour: 10,
              minute: 0,
              type: "Poop",
            },
            {
              hour: 13,
              minute: 10,
              type: "BreastFeeding",
              leftTime: 397.8564898967743,
              rightTime: 128.1482539176941,
              last: "right",
            },
          ],
        },
      ],
    });

    expect(events).toEqual([
      {
        babyNickname: "凛ちゃん",
        eventDate: "2026-05-21",
        occurredAt: "2026-05-21 04:30:00",
        eventType: "Formula",
        amountValue: 50,
        amountUnit: "ml",
        leftSeconds: null,
        rightSeconds: null,
        lastSide: null,
        rawEvent: {
          hour: 4,
          minute: 30,
          type: "Formula",
          value: { unit: "ml", value: 50 },
        },
      },
      {
        babyNickname: "凛ちゃん",
        eventDate: "2026-05-21",
        occurredAt: "2026-05-21 10:00:00",
        eventType: "Poop",
        amountValue: null,
        amountUnit: null,
        leftSeconds: null,
        rightSeconds: null,
        lastSide: null,
        rawEvent: {
          hour: 10,
          minute: 0,
          type: "Poop",
        },
      },
      {
        babyNickname: "凛ちゃん",
        eventDate: "2026-05-21",
        occurredAt: "2026-05-21 13:10:00",
        eventType: "BreastFeeding",
        amountValue: null,
        amountUnit: null,
        leftSeconds: 397.8564898967743,
        rightSeconds: 128.1482539176941,
        lastSide: "right",
        rawEvent: {
          hour: 13,
          minute: 10,
          type: "BreastFeeding",
          leftTime: 397.8564898967743,
          rightTime: 128.1482539176941,
          last: "right",
        },
      },
    ]);
  });

  it("ignores malformed days and events without throwing", () => {
    expect(
      parsePiyologEvents({
        baby: {},
        days: [
          { date: { year: 2026, month: 5 }, events: [{ type: "Pee" }] },
          { date: { year: 2026, month: 5, day: 21 }, events: [{ type: "Pee" }] },
          { date: { year: 2026, month: 5, day: 21 }, events: [{ hour: 1, minute: 2 }] },
        ],
      }),
    ).toEqual([]);
  });
});
