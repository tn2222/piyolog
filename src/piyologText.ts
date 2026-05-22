import type { PiyologEventInput } from "./piyolog";

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type TextEventParts = {
  hour: number;
  minute: number;
  label: string;
  detail: string;
  rawLine: string;
};

const dayHeaderPattern = /(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\(.+\))?/;
const babyNicknamePattern = /^(.+?)\s+\(\d+か月\d+日\)$/;
const eventLinePattern = /^(\d{1,2}):(\d{2})\s+(.+)$/;

export function parsePiyologTextEvents(text: string): PiyologEventInput[] {
  const events: PiyologEventInput[] = [];
  let currentDate: DateParts | null = null;
  let currentBabyNickname: string | null = null;
  let lastEventIndex: number | null = null;

  for (const line of text.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      continue;
    }

    const date = parseDayHeader(trimmedLine);
    if (date !== null) {
      currentDate = date;
      lastEventIndex = null;
      continue;
    }

    const babyNickname = parseBabyNickname(trimmedLine);
    if (babyNickname !== null) {
      currentBabyNickname = babyNickname;
      lastEventIndex = null;
      continue;
    }

    if (currentDate === null) {
      continue;
    }

    const eventParts = parseTextEventParts(trimmedLine);
    if (eventParts === null) {
      if (lastEventIndex !== null && !isDailySummaryLine(trimmedLine)) {
        appendContinuationLine(events[lastEventIndex], trimmedLine);
        continue;
      }
      lastEventIndex = null;
      continue;
    }

    events.push(toPiyologEventInput(currentBabyNickname, currentDate, eventParts));
    lastEventIndex = events.length - 1;
  }

  return events;
}

export function parsePiyologTextEventDates(text: string): string[] {
  const dates: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const date = parseDayHeader(line.trim());
    if (date !== null) {
      dates.push(formatDate(date));
    }
  }

  return [...new Set(dates)];
}

function parseDayHeader(line: string): DateParts | null {
  const match = line.match(dayHeaderPattern);
  if (match === null) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseBabyNickname(line: string): string | null {
  const match = line.match(babyNicknamePattern);
  return match === null ? null : match[1];
}

function parseTextEventParts(line: string): TextEventParts | null {
  const match = line.match(eventLinePattern);
  if (match === null) {
    return null;
  }

  const eventText = match[3].trim();
  const [label = "", ...detailParts] = eventText.split(/\s+/);

  if (label.length === 0) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    label,
    detail: detailParts.join(" "),
    rawLine: line,
  };
}

function isDailySummaryLine(line: string): boolean {
  return line.includes("合計") || line.startsWith("----------");
}

function appendContinuationLine(event: PiyologEventInput, line: string): void {
  const rawEvent = event.rawEvent as {
    note?: unknown;
    rawLine?: unknown;
  };
  const currentNote = typeof rawEvent.note === "string" ? rawEvent.note : "";
  const currentRawLine = typeof rawEvent.rawLine === "string" ? rawEvent.rawLine : "";

  rawEvent.note = [currentNote, line].filter((value) => value.length > 0).join(" ");
  rawEvent.rawLine = [currentRawLine, line].filter((value) => value.length > 0).join("\n");
}

function toPiyologEventInput(
  babyNickname: string | null,
  date: DateParts,
  event: TextEventParts,
): PiyologEventInput {
  const eventDate = formatDate(date);
  const note = parseNote(event.detail);
  const amount = parseAmount(event.label, event.detail);

  return {
    babyNickname,
    eventDate,
    occurredAt: `${eventDate} ${formatTime(event.hour, event.minute)}`,
    eventType: event.label,
    amountValue: amount?.amountValue ?? null,
    amountUnit: amount?.amountUnit ?? null,
    leftSeconds: parseBreastFeedingSeconds("左", event.detail),
    rightSeconds: parseBreastFeedingSeconds("右", event.detail),
    lastSide: parseLastSide(event.detail),
    rawEvent: {
      source: "text_export",
      label: event.label,
      note,
      rawLine: event.rawLine,
    },
  };
}

function parseAmount(label: string, detail: string): { amountValue: number; amountUnit: string } | null {
  if (label === "体温") {
    const temperature = detail.match(/(\d+(?:\.\d+)?)°?C/);
    return temperature === null
      ? null
      : { amountValue: Number(temperature[1]), amountUnit: "C" };
  }

  const milk = detail.match(/(\d+(?:\.\d+)?)ml/);
  return milk === null ? null : { amountValue: Number(milk[1]), amountUnit: "ml" };
}

function parseBreastFeedingSeconds(side: "左" | "右", detail: string): number | null {
  const match = detail.match(new RegExp(`${side}(\\d+(?:\\.\\d+)?)分`));
  return match === null ? null : Number(match[1]) * 60;
}

function parseLastSide(detail: string): string | null {
  if (detail.includes("▶")) {
    return "right";
  }
  if (detail.includes("◀")) {
    return "left";
  }
  return null;
}

function parseNote(detail: string): string | null {
  const note = detail
    .replace(/\d+(?:\.\d+)?ml/g, "")
    .replace(/\d+(?:\.\d+)?°?C/g, "")
    .replace(/左\d+(?:\.\d+)?分/g, "")
    .replace(/右\d+(?:\.\d+)?分/g, "")
    .replace(/[▶◀]/g, " ")
    .replace(/[()（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return note.length === 0 ? null : note;
}

function formatDate(date: DateParts): string {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

function formatTime(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}:00`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
