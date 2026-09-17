import type {
  PiyologDataFeedRange,
  UtcTimestamp,
  PiyologDataFeedClient,
} from "../domain/piyologDataFeed";
import { TiDBPiyologDataFeedRepository } from "../infrastructure/repository/tidbPiyologDataFeedRepository";
import type { DatabaseTransaction } from "../infrastructure/transaction/databaseTransaction";

export type PiyologDataFeedUpdateDependencies = {
  client: PiyologDataFeedClient;
  transaction: DatabaseTransaction;
};

export type PiyologDataFeedUpdateResult = {
  generatedAt: UtcTimestamp;
  range: PiyologDataFeedRange;
  recordCount: number;
};

export async function updatePiyologDataFeed(
  dependencies: PiyologDataFeedUpdateDependencies,
): Promise<PiyologDataFeedUpdateResult> {
  const dataFeed = await dependencies.client.getDataFeed();
  await dependencies.transaction.run(async (transactionConnection) => {
    const repository = new TiDBPiyologDataFeedRepository(transactionConnection);
    await repository.replaceRange(dataFeed);
  });
  return {
    generatedAt: dataFeed.generatedAt,
    range: dataFeed.range,
    recordCount: dataFeed.records.length,
  };
}
