import type {
  PiyologDataFeedApplyResult,
  PiyologDataFeedProjection,
  PiyologDataFeedSnapshot,
  PiyologDataFeedClient,
} from "../domain/piyologDataFeed";

export type PiyologDataFeedUpdateDependencies = {
  client: PiyologDataFeedClient;
  projection: PiyologDataFeedProjection;
};

export type PiyologDataFeedUpdateResult = PiyologDataFeedApplyResult;

export async function updatePiyologDataFeed(
  dependencies: PiyologDataFeedUpdateDependencies,
): Promise<PiyologDataFeedUpdateResult> {
  const snapshot: PiyologDataFeedSnapshot = await dependencies.client.getDataFeed();
  return dependencies.projection.apply(snapshot);
}
