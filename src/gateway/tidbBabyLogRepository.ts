import { connect } from "@tidbcloud/serverless";
import type { FullResult } from "@tidbcloud/serverless";
import type {
  CompareMetricInput,
  CompareMetricResult,
  InsertResult,
  PiyologEventInput,
  PiyologRepositoryInterface,
  SummarizePeriodInput,
  SummarizePeriodResult,
  TextExportInput,
} from "../types";

type TiDBConnection = {
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
};

type QueryResult = Pick<FullResult, "lastInsertId"> & {
  rows?: unknown[] | null;
};

export class TiDBBabyLogRepository implements PiyologRepositoryInterface {
  constructor(private readonly connection: TiDBConnection) {}

  async insertTextExport(input: TextExportInput): Promise<InsertResult> {
    const result = await this.connection.execute(
      `
INSERT INTO raw_piyolog_text_exports (
  source,
  file_id,
  file_name,
  file_updated_at,
  source_ip,
  user_agent,
  text_body
)
VALUES (?, ?, ?, ?, ?, ?, ?)
      `.trim(),
      [
        input.source,
        input.fileId,
        input.fileName,
        formatDateTime(input.updatedAt),
        input.sourceIp,
        input.userAgent,
        input.text,
      ],
    );

    return {
      id: parseInsertId(result.lastInsertId),
    };
  }

  async insertEvents(rawTextExportId: number, events: PiyologEventInput[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const valuesSql = events.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))");
    const params = events.flatMap((event) => [
      rawTextExportId,
      event.babyNickname,
      event.eventDate,
      event.occurredAt,
      event.eventType,
      event.amountValue,
      event.amountUnit,
      event.leftSeconds,
      event.rightSeconds,
      event.lastSide,
      JSON.stringify(event.rawEvent),
    ]);

    await this.connection.execute(
      `
INSERT INTO piyolog_events (
  raw_payload_id,
  baby_nickname,
  event_date,
  occurred_at,
  event_type,
  amount_value,
  amount_unit,
  left_seconds,
  right_seconds,
  last_side,
  raw_event
)
VALUES ${valuesSql.join(", ")}
      `.trim(),
      params,
    );
  }

  async deleteEventsByDates(eventDates: string[]): Promise<void> {
    const uniqueEventDates = [...new Set(eventDates)];
    if (uniqueEventDates.length === 0) {
      return;
    }

    const placeholders = uniqueEventDates.map(() => "?").join(", ");

    await this.connection.execute(
      `DELETE FROM piyolog_events WHERE event_date IN (${placeholders})`,
      uniqueEventDates,
    );
  }

  async compareMetric(input: CompareMetricInput): Promise<CompareMetricResult> {
    const metricSql = metricSqlDefinition(input.metric);
    const result = await this.connection.execute(
      `
SELECT
  CASE
    WHEN occurred_at >= ? AND occurred_at < ? THEN 'current'
    WHEN occurred_at >= ? AND occurred_at < ? THEN 'previous'
  END AS period,
  ${metricSql.expression} AS value,
  COUNT(*) AS event_count
FROM piyolog_events
WHERE occurred_at >= ?
  AND occurred_at < ?
  ${metricSql.whereSql}
GROUP BY period
      `.trim(),
      [
        toDateTime(input.currentRange.from),
        toDateTime(input.currentRange.to),
        toDateTime(input.previousRange.from),
        toDateTime(input.previousRange.to),
        toDateTime(input.previousRange.from),
        toDateTime(input.currentRange.to),
        ...metricSql.params,
      ],
    );

    return {
      metric: input.metric,
      currentRange: input.currentRange,
      previousRange: input.previousRange,
      rows: parseRows((await result).rows),
    };
  }

  async summarizePeriod(input: SummarizePeriodInput): Promise<SummarizePeriodResult> {
    const result = await this.connection.execute(
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

    return {
      range: input.range,
      granularity: input.granularity,
      rows: parseRows((await result).rows),
    };
  }
}

export function createTiDBBabyLogRepository(databaseUrl: string): PiyologRepositoryInterface {
  return new TiDBBabyLogRepository(connect({ url: databaseUrl, fullResult: true }));
}

function metricSqlDefinition(metric: CompareMetricInput["metric"]): {
  expression: string;
  whereSql: string;
  params: unknown[];
} {
  if (metric === "milk_amount") {
    return {
      expression: "COALESCE(SUM(amount_value), 0)",
      whereSql: "AND event_type = ?\n  AND amount_unit = ?",
      params: ["ミルク", "ml"],
    };
  }

  return {
    expression: "COUNT(*)",
    whereSql: "",
    params: [],
  };
}

function parseRows(rows: unknown[] | null | undefined): Record<string, unknown>[] {
  return Array.isArray(rows) ? rows.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInsertId(lastInsertId: string | null): number | null {
  if (lastInsertId == null) {
    return null;
  }

  const id = Number(lastInsertId);
  if (!Number.isSafeInteger(id)) {
    throw new Error("Unsafe TiDB insert id");
  }

  return id;
}

function formatDateTime(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

function toDateTime(date: string): string {
  return `${date} 00:00:00`;
}
