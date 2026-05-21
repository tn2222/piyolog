export type PiyologEventInput = {
  babyNickname: string | null;
  eventDate: string;
  occurredAt: string;
  eventType: string;
  amountValue: number | null;
  amountUnit: string | null;
  leftSeconds: number | null;
  rightSeconds: number | null;
  lastSide: string | null;
  rawEvent: Record<string, unknown>;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type EventParts = {
  hour: number;
  minute: number;
  type: string;
};

export function parsePiyologEvents(payload: unknown): PiyologEventInput[] {
  if (!isRecord(payload) || !Array.isArray(payload.days)) {
    return [];
  }

  const babyNickname = parseBabyNickname(payload.baby);
  const events: PiyologEventInput[] = [];

  for (const day of payload.days) {
    if (!isRecord(day) || !Array.isArray(day.events)) {
      continue;
    }

    const date = parseDateParts(day.date);
    if (date === null) {
      continue;
    }

    for (const event of day.events) {
      if (!isRecord(event)) {
        continue;
      }

      const eventParts = parseEventParts(event);
      if (eventParts === null) {
        continue;
      }

      events.push(toPiyologEventInput(babyNickname, date, eventParts, event));
    }
  }

  return events;
}

function toPiyologEventInput(
  babyNickname: string | null,
  date: DateParts,
  event: EventParts,
  rawEvent: Record<string, unknown>,
): PiyologEventInput {
  const eventDate = formatDate(date);
  const occurredAt = `${eventDate} ${formatTime(event.hour, event.minute)}`;
  const value = parseValue(rawEvent.value);

  return {
    babyNickname,
    eventDate,
    occurredAt,
    eventType: event.type,
    amountValue: value?.amountValue ?? null,
    amountUnit: value?.amountUnit ?? null,
    leftSeconds: parseOptionalNumber(rawEvent.leftTime),
    rightSeconds: parseOptionalNumber(rawEvent.rightTime),
    lastSide: typeof rawEvent.last === "string" ? rawEvent.last : null,
    rawEvent,
  };
}

function parseBabyNickname(value: unknown): string | null {
  return isRecord(value) && typeof value.nickname === "string" ? value.nickname : null;
}

function parseDateParts(value: unknown): DateParts | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.year !== "number" ||
    typeof value.month !== "number" ||
    typeof value.day !== "number"
  ) {
    return null;
  }

  return {
    year: value.year,
    month: value.month,
    day: value.day,
  };
}

function parseEventParts(value: Record<string, unknown>): EventParts | null {
  if (
    typeof value.hour !== "number" ||
    typeof value.minute !== "number" ||
    typeof value.type !== "string"
  ) {
    return null;
  }

  return {
    hour: value.hour,
    minute: value.minute,
    type: value.type,
  };
}

function parseValue(value: unknown): { amountValue: number; amountUnit: string | null } | null {
  if (!isRecord(value) || typeof value.value !== "number") {
    return null;
  }

  return {
    amountValue: value.value,
    amountUnit: typeof value.unit === "string" ? value.unit : null,
  };
}

function parseOptionalNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
