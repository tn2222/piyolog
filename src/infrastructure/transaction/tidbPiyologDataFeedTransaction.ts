import { connect } from "@tidbcloud/serverless";
import type { PiyologDataFeedTransaction } from "../../application/updatePiyologDataFeedUseCase";
import type { PiyologDataFeedRepository } from "../../domain/piyologDataFeed";
import {
  type PiyologDataFeedConnection,
  TiDBPiyologDataFeedRepository,
} from "../repository/tidbPiyologDataFeedRepository";

type TiDBTransaction = PiyologDataFeedConnection & {
  commit(): Promise<unknown>;
  rollback(): Promise<unknown>;
};

type TiDBTransactionalConnection = {
  begin(): Promise<TiDBTransaction>;
};

export class TiDBPiyologDataFeedTransaction implements PiyologDataFeedTransaction {
  constructor(private readonly connection: TiDBTransactionalConnection) {}

  async run(work: (repository: PiyologDataFeedRepository) => Promise<void>): Promise<void> {
    const transaction = await this.connection.begin();
    try {
      await work(new TiDBPiyologDataFeedRepository(transaction));
      await transaction.commit();
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
      }
      throw error;
    }
  }
}

export function createTiDBPiyologDataFeedTransaction(
  databaseUrl: string,
): PiyologDataFeedTransaction {
  return new TiDBPiyologDataFeedTransaction(
    connect({ url: databaseUrl, fullResult: true }),
  );
}
