import { connect } from "@tidbcloud/serverless";
import type {
  PiyologDataFeedRecord,
  PiyologDataFeedApplyResult,
  PiyologDataFeedProjection,
  PiyologDataFeedSnapshot,
} from "../../domain/piyologDataFeed";
import { toTiDBDateTime } from "../../domain/piyologDataFeed";

type TiDBQueryResult = {
  rows?: unknown[] | null;
};

export type PiyologDataFeedTransaction = {
  execute(sql: string, params?: unknown[]): Promise<TiDBQueryResult>;
  commit(): Promise<unknown>;
  rollback(): Promise<unknown>;
};

export type PiyologDataFeedTransactionalConnection = {
  begin(): Promise<PiyologDataFeedTransaction>;
};

export class TiDBPiyologDataFeedProjection implements PiyologDataFeedProjection {
  constructor(private readonly connection: PiyologDataFeedTransactionalConnection) {}

  async apply(snapshot: PiyologDataFeedSnapshot): Promise<PiyologDataFeedApplyResult> {
    const transaction = await this.connection.begin();

    try {
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

      await transaction.commit();
      return {
        generatedAt: snapshot.generatedAt,
        range: snapshot.range,
        recordCount: snapshot.records.length,
      };
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
      }
      throw error;
    }
  }
}

export function createTiDBPiyologDataFeedProjection(
  databaseUrl: string,
): PiyologDataFeedProjection {
  return new TiDBPiyologDataFeedProjection(
    connect({ url: databaseUrl, fullResult: true }) as unknown as PiyologDataFeedTransactionalConnection,
  );
}

function toEventParams(record: PiyologDataFeedRecord): unknown[] {
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
