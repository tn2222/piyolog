import { connect } from "@tidbcloud/serverless";
import type { FullResult } from "@tidbcloud/serverless";
import type { PiyologEventInput } from "./piyolog";
import type { RawPayloadInput, RawPayloadRepository } from "./types";

type TiDBConnection = {
  execute(sql: string, params?: unknown[]): Promise<Pick<FullResult, "lastInsertId">>;
};

export class TiDBRawPayloadRepository implements RawPayloadRepository {
  constructor(private readonly connection: TiDBConnection) {}

  async insert(input: RawPayloadInput) {
    const result = await this.connection.execute(
      `
INSERT INTO raw_piyolog_payloads (source_ip, user_agent, payload_json)
VALUES (?, ?, CAST(? AS JSON))
      `.trim(),
      [input.sourceIp, input.userAgent, JSON.stringify(input.payload)],
    );

    return {
      id: parseInsertId(result.lastInsertId),
    };
  }

  async insertEvents(rawPayloadId: number, events: PiyologEventInput[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const valuesSql = events.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))");
    const params = events.flatMap((event) => [
      rawPayloadId,
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
}

export function createTiDBRawPayloadRepository(databaseUrl: string): RawPayloadRepository {
  return new TiDBRawPayloadRepository(connect({ url: databaseUrl, fullResult: true }));
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
