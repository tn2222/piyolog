import type {
  PiyologDataFeedRange,
  UtcTimestamp,
  PiyologDataFeedClient,
} from "../domain/piyologDataFeed";
import { TiDBPiyologDataFeedRepository } from "../infrastructure/repository/tidbPiyologDataFeedRepository";
import type { DatabaseTransactionInterface } from "./databaseTransaction";

export type PiyologDataFeedUpdateDependencies = {
  client: PiyologDataFeedClient;
  transaction: DatabaseTransactionInterface;
};

export type PiyologDataFeedUpdateResult = {
  generatedAt: UtcTimestamp;
  range: PiyologDataFeedRange;
  recordCount: number;
};

export async function updatePiyologDataFeed(
  dependencies: PiyologDataFeedUpdateDependencies,
): Promise<PiyologDataFeedUpdateResult> {
  const snapshot = await dependencies.client.getDataFeed();
  await dependencies.transaction.run(async (connection) => {
    const repository = new TiDBPiyologDataFeedRepository(connection);
    await repository.replaceRange(snapshot);
  });
  return {
    generatedAt: snapshot.generatedAt,
    range: snapshot.range,
    recordCount: snapshot.records.length,
  };
}
