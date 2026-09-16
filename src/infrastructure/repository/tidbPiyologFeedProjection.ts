import { connect } from "@tidbcloud/serverless";
import type {
  PiyologFeedRecord,
  PiyologFeedApplyResult,
  PiyologFeedProjection,
  PiyologFeedSnapshot,
  UtcTimestamp,
} from "../../domain/piyologFeed";
import {
  compareUtcTimestamps,
  toTiDBDateTime,
} from "../../domain/piyologFeed";

type TiDBQueryResult = {
  rows?: unknown[] | null;
};

export type PiyologFeedTransaction = {
  execute(sql: string, params?: unknown[]): Promise<TiDBQueryResult>;
  commit(): Promise<unknown>;
  rollback(): Promise<unknown>;
};

export type PiyologFeedTransactionalConnection = {
  begin(): Promise<PiyologFeedTransaction>;
};

export class PiyologFeedProjectionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PiyologFeedProjectionError";
    this.code = code;
  }
}

export class TiDBPiyologFeedProjection implements PiyologFeedProjection {
  constructor(private readonly connection: PiyologFeedTransactionalConnection) {}

  async apply(snapshot: PiyologFeedSnapshot): Promise<PiyologFeedApplyResult> {
    const transaction = await this.connection.begin();
    let committed = false;

    try {
      const stateResult = await transaction.execute(
        `
SELECT generated_at
FROM piyolog_feed_sync_state
WHERE feed_key = ?
FOR UPDATE
        `.trim(),
        ["default"],
      );
      const stateRow = firstRow(stateResult.rows);
      if (stateRow === null) {
        throw new PiyologFeedProjectionError(
          "sync_state_missing",
          "Piyolog feed sync state row is missing",
        );
      }

      const currentGeneratedAt = parseStoredTimestamp(stateRow.generated_at);
      if (
        currentGeneratedAt !== null &&
        compareUtcTimestamps(currentGeneratedAt, snapshot.generatedAt) >= 0
      ) {
        await transaction.commit();
        committed = true;
        return {
          status: "skipped",
          generatedAt: snapshot.generatedAt,
          range: snapshot.range,
          recordCount: snapshot.records.length,
        };
      }

      await transaction.execute(
        `
DELETE FROM piyolog_feed_events
WHERE occurred_at >= ?
  AND occurred_at < ?
        `.trim(),
        [toTiDBDateTime(snapshot.range.from), toTiDBDateTime(snapshot.range.to)],
      );

      for (const records of chunk(snapshot.records, 100)) {
        await transaction.execute(
          `
INSERT INTO piyolog_feed_events (
  event_id,
  occurred_at,
  event_type,
  amount_value,
  amount_unit,
  left_seconds,
  right_seconds,
  last_side,
  details_amount,
  details_hardness,
  details_color,
  raw_record
)
VALUES ${records.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))").join(",\n")}
ON DUPLICATE KEY UPDATE
  occurred_at = VALUES(occurred_at),
  event_type = VALUES(event_type),
  amount_value = VALUES(amount_value),
  amount_unit = VALUES(amount_unit),
  left_seconds = VALUES(left_seconds),
  right_seconds = VALUES(right_seconds),
  last_side = VALUES(last_side),
  details_amount = VALUES(details_amount),
  details_hardness = VALUES(details_hardness),
  details_color = VALUES(details_color),
  raw_record = VALUES(raw_record),
  updated_at = CURRENT_TIMESTAMP
          `.trim(),
          records.flatMap(toEventParams),
        );
      }

      await transaction.execute(
        `
INSERT INTO piyolog_feed_sync_state (
  feed_key,
  generated_at,
  range_from,
  range_to
)
VALUES (?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  generated_at = VALUES(generated_at),
  range_from = VALUES(range_from),
  range_to = VALUES(range_to),
  updated_at = CURRENT_TIMESTAMP
        `.trim(),
        [
          "default",
          toTiDBDateTime(snapshot.generatedAt),
          toTiDBDateTime(snapshot.range.from),
          toTiDBDateTime(snapshot.range.to),
        ],
      );

      await transaction.commit();
      committed = true;
      return {
        status: "applied",
        generatedAt: snapshot.generatedAt,
        range: snapshot.range,
        recordCount: snapshot.records.length,
      };
    } catch (error) {
      if (!committed) {
        try {
          await transaction.rollback();
        } catch {
        }
      }
      throw error;
    }
  }
}

export function createTiDBPiyologFeedProjection(
  databaseUrl: string,
): PiyologFeedProjection {
  return new TiDBPiyologFeedProjection(
    connect({ url: databaseUrl, fullResult: true }) as unknown as PiyologFeedTransactionalConnection,
  );
}

function toEventParams(record: PiyologFeedRecord): unknown[] {
  return [
    record.eventId,
    toTiDBDateTime(record.datetime),
    record.type,
    record.value?.value ?? null,
    record.value?.unit ?? null,
    record.leftTime,
    record.rightTime,
    record.last,
    record.details?.amount ?? null,
    record.details?.hardness ?? null,
    record.details?.color ?? null,
    JSON.stringify(record.rawRecord),
  ];
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function firstRow(rows: unknown[] | null | undefined): Record<string, unknown> | null {
  const row = rows?.[0];
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return null;
  }
  return row as Record<string, unknown>;
}

function parseStoredTimestamp(value: unknown): UtcTimestamp | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new PiyologFeedProjectionError(
        "invalid_sync_state",
        "Piyolog feed sync state timestamp is invalid",
      );
    }
    return value.toISOString() as UtcTimestamp;
  }

  if (typeof value !== "string") {
    throw new PiyologFeedProjectionError(
      "invalid_sync_state",
      "Piyolog feed sync state timestamp is invalid",
    );
  }

  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/,
  );
  if (match === null) {
    throw new PiyologFeedProjectionError(
      "invalid_sync_state",
      "Piyolog feed sync state timestamp is invalid",
    );
  }

  const milliseconds = (match[3] ?? "").slice(0, 3).padEnd(3, "0");
  const timestamp = `${match[1]}T${match[2]}.${milliseconds}Z`;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== timestamp) {
    throw new PiyologFeedProjectionError(
      "invalid_sync_state",
      "Piyolog feed sync state timestamp is invalid",
    );
  }

  return date.toISOString() as UtcTimestamp;
}
