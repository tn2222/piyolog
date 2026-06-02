export type DateRange = {
  from: string;
  to: string;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const tokyoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const tokyoTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

export function parseDateRange(input: unknown): DateRange | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const from = parseDateRangeBound(record.from, "from");
  const to = parseDateRangeBound(record.to, "to");
  if (from === null || to === null) {
    return null;
  }

  if (from >= to) {
    return null;
  }

  return {
    from,
    to,
  };
}

export function calculateDateRangeDays(range: DateRange): number {
  const from = Date.parse(`${range.from}T00:00:00.000Z`);
  const to = Date.parse(`${range.to}T00:00:00.000Z`);
  return (to - from) / 86_400_000;
}

function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !datePattern.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseDateRangeBound(value: unknown, boundary: "from" | "to"): string | null {
  if (isValidDateString(value)) {
    return value;
  }
  if (typeof value !== "string" || !dateTimePattern.test(value)) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const dateString = formatTokyoDate(date);
  if (boundary === "from" || isStartOfTokyoDay(date)) {
    return dateString;
  }

  return addDays(dateString, 1);
}

function formatTokyoDate(date: Date): string {
  return tokyoDateFormatter.format(date);
}

function isStartOfTokyoDay(date: Date): boolean {
  const parts = Object.fromEntries(
    tokyoTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return (
    parts.hour === "00" &&
    parts.minute === "00" &&
    parts.second === "00" &&
    date.getUTCMilliseconds() === 0
  );
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
