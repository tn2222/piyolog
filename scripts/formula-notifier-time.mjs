export function normalizeDatabaseDateTime(value) {
  const date = value instanceof Date ? value : parseDatabaseDateTime(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error("next_formula_at is not a valid datetime");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function parseDatabaseDateTime(value) {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/,
  );
  if (match) {
    const milliseconds = (match[3] ?? "").slice(0, 3).padEnd(3, "0");
    return new Date(`${match[1]}T${match[2]}.${milliseconds}Z`);
  }

  return new Date(value);
}
