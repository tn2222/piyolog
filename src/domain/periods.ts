export type DateRange = {
  from: string;
  to: string;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateRange(input: unknown): DateRange | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  if (!isValidDateString(record.from) || !isValidDateString(record.to)) {
    return null;
  }

  if (record.from >= record.to) {
    return null;
  }

  return {
    from: record.from,
    to: record.to,
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
