import { describe, expect, it } from "vitest";
import { parsePiyologTextEventDates, parsePiyologTextEvents } from "../src/piyologText";

const exportText = `
【ぴよログ】2026年5月
----------
2026/5/20(水)
赤ちゃん (0か月14日)

01:00   ミルク 35ml
06:45   うんち (多め/黄色)  大量！！
08:50   母乳 左8分 ▶ 右7分
12:25   寝る
12:45   起きる (0時間20分)
23:45   体温 37.0°C

ミルク合計 8回 360ml

----------
2026/5/21(木)
赤ちゃん (0か月15日)

01:25   おしっこ
08:00   吐く  溢乳
10:30   鼻水吸引  大きい鼻くそ取れた
`;

describe("parsePiyologTextEvents", () => {
  it("extracts every timestamped row as a Japanese event", () => {
    const events = parsePiyologTextEvents(exportText);

    expect(events).toEqual([
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-20",
        occurredAt: "2026-05-20 01:00:00",
        eventType: "ミルク",
        amountValue: 35,
        amountUnit: "ml",
        leftSeconds: null,
        rightSeconds: null,
        lastSide: null,
        rawEvent: {
          source: "text_export",
          label: "ミルク",
          note: null,
          rawLine: "01:00   ミルク 35ml",
        },
      },
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-20",
        occurredAt: "2026-05-20 06:45:00",
        eventType: "うんち",
        amountValue: null,
        amountUnit: null,
        leftSeconds: null,
        rightSeconds: null,
        lastSide: null,
        rawEvent: {
          source: "text_export",
          label: "うんち",
          note: "多め/黄色 大量！！",
          rawLine: "06:45   うんち (多め/黄色)  大量！！",
        },
      },
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-20",
        occurredAt: "2026-05-20 08:50:00",
        eventType: "母乳",
        amountValue: null,
        amountUnit: null,
        leftSeconds: 480,
        rightSeconds: 420,
        lastSide: "right",
        rawEvent: {
          source: "text_export",
          label: "母乳",
          note: null,
          rawLine: "08:50   母乳 左8分 ▶ 右7分",
        },
      },
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-20",
        occurredAt: "2026-05-20 12:25:00",
        eventType: "寝る",
        amountValue: null,
        amountUnit: null,
        leftSeconds: null,
        rightSeconds: null,
        lastSide: null,
        rawEvent: {
          source: "text_export",
          label: "寝る",
          note: null,
          rawLine: "12:25   寝る",
        },
      },
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-20",
        occurredAt: "2026-05-20 12:45:00",
        eventType: "起きる",
        amountValue: null,
        amountUnit: null,
        leftSeconds: null,
        rightSeconds: null,
        lastSide: null,
        rawEvent: {
          source: "text_export",
          label: "起きる",
          note: "0時間20分",
          rawLine: "12:45   起きる (0時間20分)",
        },
      },
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-20",
        occurredAt: "2026-05-20 23:45:00",
        eventType: "体温",
        amountValue: 37,
        amountUnit: "C",
        leftSeconds: null,
        rightSeconds: null,
        lastSide: null,
        rawEvent: {
          source: "text_export",
          label: "体温",
          note: null,
          rawLine: "23:45   体温 37.0°C",
        },
      },
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-21",
        occurredAt: "2026-05-21 01:25:00",
        eventType: "おしっこ",
        amountValue: null,
        amountUnit: null,
        leftSeconds: null,
        rightSeconds: null,
        lastSide: null,
        rawEvent: {
          source: "text_export",
          label: "おしっこ",
          note: null,
          rawLine: "01:25   おしっこ",
        },
      },
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-21",
        occurredAt: "2026-05-21 08:00:00",
        eventType: "吐く",
        amountValue: null,
        amountUnit: null,
        leftSeconds: null,
        rightSeconds: null,
        lastSide: null,
        rawEvent: {
          source: "text_export",
          label: "吐く",
          note: "溢乳",
          rawLine: "08:00   吐く  溢乳",
        },
      },
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-21",
        occurredAt: "2026-05-21 10:30:00",
        eventType: "鼻水吸引",
        amountValue: null,
        amountUnit: null,
        leftSeconds: null,
        rightSeconds: null,
        lastSide: null,
        rawEvent: {
          source: "text_export",
          label: "鼻水吸引",
          note: "大きい鼻くそ取れた",
          rawLine: "10:30   鼻水吸引  大きい鼻くそ取れた",
        },
      },
    ]);
  });

  it("keeps continuation lines as part of the previous timestamped event note", () => {
    const events = parsePiyologTextEvents(`
2026/5/20(水)
赤ちゃん (0か月14日)

22:15   吐く  溢乳 レベル
鼻と口から
22:40   ミルク 40ml
`);

    expect(events[0]).toEqual({
      babyNickname: "赤ちゃん",
      eventDate: "2026-05-20",
      occurredAt: "2026-05-20 22:15:00",
      eventType: "吐く",
      amountValue: null,
      amountUnit: null,
      leftSeconds: null,
      rightSeconds: null,
      lastSide: null,
      rawEvent: {
        source: "text_export",
        label: "吐く",
        note: "溢乳 レベル 鼻と口から",
        rawLine: "22:15   吐く  溢乳 レベル\n鼻と口から",
      },
    });
  });

  it("accepts text exports whose first date line is prefixed with the Piyolog title", () => {
    const events = parsePiyologTextEvents(`
【ぴよログ】2026/5/22(金)
赤ちゃん (0か月16日)

00:00   母乳 左9分 ▶ 右13分
01:30   ミルク 40ml
`);

    expect(events).toEqual([
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-22",
        occurredAt: "2026-05-22 00:00:00",
        eventType: "母乳",
        amountValue: null,
        amountUnit: null,
        leftSeconds: 540,
        rightSeconds: 780,
        lastSide: "right",
        rawEvent: {
          source: "text_export",
          label: "母乳",
          note: null,
          rawLine: "00:00   母乳 左9分 ▶ 右13分",
        },
      },
      {
        babyNickname: "赤ちゃん",
        eventDate: "2026-05-22",
        occurredAt: "2026-05-22 01:30:00",
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
          rawLine: "01:30   ミルク 40ml",
        },
      },
    ]);
  });
});

describe("parsePiyologTextEventDates", () => {
  it("extracts unique dates from text export day sections", () => {
    expect(parsePiyologTextEventDates(exportText)).toEqual(["2026-05-20", "2026-05-21"]);
  });

  it("extracts dates from Piyolog title-prefixed date lines", () => {
    expect(parsePiyologTextEventDates("【ぴよログ】2026/5/22(金)")).toEqual(["2026-05-22"]);
  });
});
