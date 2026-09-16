import type {
  PiyologDataFeedApplyResult,
  PiyologDataFeedProjection,
  PiyologDataFeedSnapshot,
  PiyologDataFeedSource,
} from "../domain/piyologDataFeed";

export type PiyologDataFeedUpdateDependencies = {
  source: PiyologDataFeedSource;
  projection: PiyologDataFeedProjection;
};

export type PiyologDataFeedUpdateResult = PiyologDataFeedApplyResult;

export async function updatePiyologDataFeed(
  dependencies: PiyologDataFeedUpdateDependencies,
): Promise<PiyologDataFeedUpdateResult> {
  const snapshot: PiyologDataFeedSnapshot = await dependencies.source.getDataFeed();
  return dependencies.projection.apply(snapshot);
}
