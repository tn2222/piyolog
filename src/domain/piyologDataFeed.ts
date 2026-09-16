export type UtcTimestamp = string & {
  readonly __utcTimestamp: unique symbol;
};

export type PiyologDataFeedRange = {
  from: UtcTimestamp;
  to: UtcTimestamp;
};

export type PiyologDataFeedValue = {
  value: number | null;
  unit: string;
  left: number | null;
  right: number | null;
};

export type PiyologDataFeedDetails = {
  amount: string | null;
  hardness: string | null;
  color: string | null;
};

export type PiyologDataFeedRecord = {
  eventId: string;
  datetime: UtcTimestamp;
  type: string;
  last: string | null;
  leftTime: number | null;
  rightTime: number | null;
  value: PiyologDataFeedValue | null;
  details: PiyologDataFeedDetails | null;
  rawRecord: Record<string, unknown>;
};

export type PiyologDataFeedSnapshot = {
  schemaVersion: 1;
  generatedAt: UtcTimestamp;
  range: PiyologDataFeedRange;
  records: PiyologDataFeedRecord[];
};

export type PiyologDataFeedClient = {
  getDataFeed(): Promise<PiyologDataFeedSnapshot>;
};

export type PiyologDataFeedApplyResult = {
  generatedAt: UtcTimestamp;
  range: PiyologDataFeedRange;
  recordCount: number;
};

export type PiyologDataFeedProjection = {
  apply(snapshot: PiyologDataFeedSnapshot): Promise<PiyologDataFeedApplyResult>;
};

export class PiyologDataFeedValidationError extends Error {
  readonly code = "invalid_feed";

  constructor(message: string) {
    super(message);
    this.name = "PiyologDataFeedValidationError";
  }
}

export function parsePiyologDataFeedSnapshot(input: unknown): PiyologDataFeedSnapshot {
  const payload = requireRecord(input, "feed response");
  if (payload.schema_version !== 1) {
    throw new PiyologDataFeedValidationError("Unsupported feed schema");
  }

  const generatedAt = parseUtcTimestamp(payload.generated_at, "generated_at");
  const range = parseRange(payload.range);
  if (range.to !== generatedAt) {
    throw new PiyologDataFeedValidationError("generated_at must equal range.to");
  }

  if (compareUtcTimestamps(range.from, range.to) >= 0) {
    throw new PiyologDataFeedValidationError("range.from must be before range.to");
  }

  if (!Array.isArray(payload.records)) {
    throw new PiyologDataFeedValidationError("records must be an array");
  }

  const eventIds = new Set<string>();
  const records = payload.records.map((record, index) => {
    const parsedRecord = parseRecord(record, index);
    if (eventIds.has(parsedRecord.eventId)) {
      throw new PiyologDataFeedValidationError("event_id must be unique");
    }
    eventIds.add(parsedRecord.eventId);

    if (
      compareUtcTimestamps(parsedRecord.datetime, range.from) < 0 ||
      compareUtcTimestamps(parsedRecord.datetime, range.to) >= 0
    ) {
      throw new PiyologDataFeedValidationError("record datetime is outside the response range");
    }

    return parsedRecord;
  });

  return {
    schemaVersion: 1,
    generatedAt,
    range,
    records,
  };
}

export function parseUtcTimestamp(input: unknown, fieldName: string): UtcTimestamp {
  if (typeof input !== "string") {
    throw new PiyologDataFeedValidationError(`${fieldName} must be a UTC timestamp`);
  }

  const match = input.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/,
  );
  if (match === null) {
    throw new PiyologDataFeedValidationError(`${fieldName} must be an ISO UTC timestamp`);
  }

  const fraction = (match[7] ?? "").slice(0, 3).padEnd(3, "0");
  const canonicalInput = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${fraction}Z`;
  const date = new Date(input);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== canonicalInput) {
    throw new PiyologDataFeedValidationError(`${fieldName} is not a valid UTC timestamp`);
  }

  return date.toISOString() as UtcTimestamp;
}

export function compareUtcTimestamps(left: UtcTimestamp, right: UtcTimestamp): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function toTiDBDateTime(value: UtcTimestamp): string {
  return `${value.slice(0, 10)} ${value.slice(11, 23)}`;
}

function parseRange(input: unknown): PiyologDataFeedRange {
  const range = requireRecord(input, "range");
  return {
    from: parseUtcTimestamp(range.from, "range.from"),
    to: parseUtcTimestamp(range.to, "range.to"),
  };
}

function parseRecord(input: unknown, index: number): PiyologDataFeedRecord {
  const record = requireRecord(input, `records[${index}]`);
  const eventId = record.event_id;
  if (typeof eventId !== "string" || eventId.length === 0) {
    throw new PiyologDataFeedValidationError("event_id must be a non-empty string");
  }

  const type = record.type;
  if (typeof type !== "string" || type.length === 0) {
    throw new PiyologDataFeedValidationError("type must be a non-empty string");
  }

  const value = parseValue(record.value, index);
  const details = parseDetails(record.details, index);
  const last = parseOptionalString(record.last, "last");
  const leftTime = parseOptionalPositiveNumber(record.leftTime, "leftTime");
  const rightTime = parseOptionalPositiveNumber(record.rightTime, "rightTime");

  return {
    eventId,
    datetime: parseUtcTimestamp(record.datetime, `records[${index}].datetime`),
    type,
    last,
    leftTime,
    rightTime,
    value,
    details,
    rawRecord: record,
  };
}

function parseValue(input: unknown, index: number): PiyologDataFeedValue | null {
  if (input === undefined) {
    return null;
  }

  const value = requireRecord(input, `records[${index}].value`);
  return {
    value: parseOptionalPositiveNumber(value.value, "value.value"),
    unit: parseRequiredString(value.unit, "value.unit"),
    left: parseOptionalPositiveNumber(value.left, "value.left"),
    right: parseOptionalPositiveNumber(value.right, "value.right"),
  };
}

function parseDetails(input: unknown, index: number): PiyologDataFeedDetails | null {
  if (input === undefined) {
    return null;
  }

  const details = requireRecord(input, `records[${index}].details`);
  return {
    amount: parseOptionalString(details.amount, "details.amount"),
    hardness: parseOptionalString(details.hardness, "details.hardness"),
    color: parseOptionalString(details.color, "details.color"),
  };
}

function parseOptionalString(input: unknown, fieldName: string): string | null {
  if (input === undefined) {
    return null;
  }
  if (typeof input !== "string" || input.length === 0) {
    throw new PiyologDataFeedValidationError(`${fieldName} must be a non-empty string`);
  }
  return input;
}

function parseRequiredString(input: unknown, fieldName: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new PiyologDataFeedValidationError(`${fieldName} must be a non-empty string`);
  }
  return input;
}

function parseOptionalPositiveNumber(input: unknown, fieldName: string): number | null {
  if (input === undefined) {
    return null;
  }
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) {
    throw new PiyologDataFeedValidationError(`${fieldName} must be a positive number`);
  }
  return input;
}

function requireRecord(input: unknown, fieldName: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new PiyologDataFeedValidationError(`${fieldName} must be an object`);
  }
  return input as Record<string, unknown>;
}
