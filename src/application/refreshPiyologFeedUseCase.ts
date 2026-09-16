import type {
  PiyologFeedApplyResult,
  PiyologFeedProjection,
  PiyologFeedSnapshot,
  PiyologFeedSource,
} from "../domain/piyologFeed";

export type PiyologFeedRefreshDependencies = {
  source: PiyologFeedSource;
  projection: PiyologFeedProjection;
};

export type PiyologFeedRefreshResult = PiyologFeedApplyResult;

export async function refreshPiyologFeed(
  dependencies: PiyologFeedRefreshDependencies,
): Promise<PiyologFeedRefreshResult> {
  const snapshot: PiyologFeedSnapshot = await dependencies.source.getSnapshot();
  return dependencies.projection.apply(snapshot);
}
