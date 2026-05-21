import { connect } from "@tidbcloud/serverless";
import type { FullResult } from "@tidbcloud/serverless";
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
