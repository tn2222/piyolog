import { connect } from "@tidbcloud/serverless";
import type { FullResult } from "@tidbcloud/serverless";
import type {
  SummarizePeriodInput,
  SummarizePeriodResult,
  SummaryPeriodDay,
  SummaryPeriodQueryServiceInterface,
} from "../../types";

type TiDBConnection = {
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
};

type QueryResult = Pick<FullResult, "lastInsertId"> & {
  rows?: unknown[] | null;
};

export class TiDBSummaryPeriodQueryService implements SummaryPeriodQueryServiceInterface {
  constructor(private readonly connection: TiDBConnection) {}

  async summarizePeriod(input: SummarizePeriodInput): Promise<SummarizePeriodResult> {
    const eventsResult = await this.connection.execute(
      `
SELECT
  occurred_at,
  event_date,
  event_type,
  amount_value,
  amount_unit,
  left_seconds,
  right_seconds,
  last_side,
  raw_event
FROM piyolog_events
WHERE occurred_at >= ?
  AND occurred_at < ?
ORDER BY occurred_at
      `.trim(),
      [
        toDateTime(input.range.from),
        toDateTime(input.range.to),
      ],
    );
    const diariesResult = await this.connection.execute(
      `
SELECT
  entry_date,
  journal
FROM piyolog_diaries
WHERE entry_date >= ?
  AND entry_date < ?
ORDER BY entry_date
      `.trim(),
      [
        input.range.from,
        input.range.to,
      ],
    );

    return {
      range: input.range,
      granularity: input.granularity,
      days: buildDays(parseRows(eventsResult.rows), parseRows(diariesResult.rows)),
    };
  }
}

export function createTiDBSummaryPeriodQueryService(
  databaseUrl: string,
): SummaryPeriodQueryServiceInterface {
  return new TiDBSummaryPeriodQueryService(connect({ url: databaseUrl, fullResult: true }));
}

function buildDays(
  events: Record<string, unknown>[],
  diaries: Record<string, unknown>[],
): SummaryPeriodDay[] {
  const daysByDate = new Map<string, SummaryPeriodDay>();

  for (const event of events) {
    const date = parseDateValue(event.event_date);
    if (date === null) {
      continue;
    }

    getOrCreateDay(daysByDate, date).events.push(event);
  }

  for (const diary of diaries) {
    const date = parseDateValue(diary.entry_date);
    if (date === null) {
      continue;
    }

    getOrCreateDay(daysByDate, date).journal = parseJournal(diary.journal);
  }

  return [...daysByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function getOrCreateDay(
  daysByDate: Map<string, SummaryPeriodDay>,
  date: string,
): SummaryPeriodDay {
  const existingDay = daysByDate.get(date);
  if (existingDay !== undefined) {
    return existingDay;
  }

  const day: SummaryPeriodDay = {
    date,
    events: [],
    journal: null,
  };
  daysByDate.set(date, day);
  return day;
}

function parseRows(rows: unknown[] | null | undefined): Record<string, unknown>[] {
  return Array.isArray(rows) ? rows.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDateValue(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") {
    return null;
  }

  return value.slice(0, 10);
}

function parseJournal(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function toDateTime(date: string): string {
  return `${date} 00:00:00`;
}
