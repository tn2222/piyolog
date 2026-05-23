import { connect } from "@tidbcloud/serverless";
import type { FullResult } from "@tidbcloud/serverless";
import type { PiyologEventInput, PiyologRepository, TextExportInput } from "./types";

type TiDBConnection = {
  execute(sql: string, params?: unknown[]): Promise<Pick<FullResult, "lastInsertId">>;
};

export class TiDBPiyologRepository implements PiyologRepository {
  constructor(private readonly connection: TiDBConnection) {}

  async insertTextExport(input: TextExportInput) {
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
}

export function createTiDBPiyologRepository(databaseUrl: string): PiyologRepository {
  return new TiDBPiyologRepository(connect({ url: databaseUrl, fullResult: true }));
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
