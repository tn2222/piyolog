import type {
  PiyologDataFeedRange,
  PiyologDataFeedRepository,
  UtcTimestamp,
  PiyologDataFeedClient,
} from "../domain/piyologDataFeed";
import type { DatabaseTransactionInterface } from "./databaseTransaction";

export type PiyologDataFeedUpdateDependencies = {
  client: PiyologDataFeedClient;
  transaction: DatabaseTransactionInterface<PiyologDataFeedRepository>;
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
  await dependencies.transaction.run(async (repository) => {
    await repository.replaceRange(snapshot);
  });
  return {
    generatedAt: snapshot.generatedAt,
    range: snapshot.range,
    recordCount: snapshot.records.length,
  };
}
