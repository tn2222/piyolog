import type {
  PiyologDataFeedApplyResult,
  PiyologDataFeedProjection,
  PiyologDataFeedSnapshot,
  PiyologDataFeedSource,
} from "../domain/piyologDataFeed";

export type PiyologDataFeedRefreshDependencies = {
  source: PiyologDataFeedSource;
  projection: PiyologDataFeedProjection;
};

export type PiyologDataFeedRefreshResult = PiyologDataFeedApplyResult;

export async function refreshPiyologDataFeed(
  dependencies: PiyologDataFeedRefreshDependencies,
): Promise<PiyologDataFeedRefreshResult> {
  const snapshot: PiyologDataFeedSnapshot = await dependencies.source.getSnapshot();
  return dependencies.projection.apply(snapshot);
}
