import type {
  Env,
  ResolvedEnv,
  ResolvedPiyologDataFeedEnv,
  SecretValue,
} from "./types";

export async function resolveSecrets(env: Env): Promise<ResolvedEnv> {
  const [
    ingestToken,
    databaseUrl,
    slackCommandToken,
    personalLlmGatewayUrl,
    personalLlmGatewayToken,
    lineChannelSecret,
    lineChannelAccessToken,
  ] = await Promise.all([
    resolveSecret(env.INGEST_TOKEN),
    resolveSecret(env.DATABASE_URL),
    resolveSecret(env.SLACK_COMMAND_TOKEN),
    resolveSecret(env.PERSONAL_LLM_GATEWAY_URL),
    resolveSecret(env.PERSONAL_LLM_GATEWAY_TOKEN),
    resolveSecret(env.LINE_CHANNEL_SECRET),
    resolveSecret(env.LINE_CHANNEL_ACCESS_TOKEN),
  ]);

  return {
    INGEST_TOKEN: ingestToken,
    DATABASE_URL: databaseUrl,
    SLACK_COMMAND_TOKEN: slackCommandToken,
    PERSONAL_LLM_GATEWAY_URL: personalLlmGatewayUrl,
    PERSONAL_LLM_GATEWAY_TOKEN: personalLlmGatewayToken,
    LINE_CHANNEL_SECRET: lineChannelSecret,
    LINE_CHANNEL_ACCESS_TOKEN: lineChannelAccessToken,
  };
}

export async function resolvePiyologDataFeedSecrets(
  env: Pick<Env, "DATABASE_URL" | "PIYOLOG_FEED_URL">,
): Promise<ResolvedPiyologDataFeedEnv> {
  if (env.PIYOLOG_FEED_URL === undefined) {
    throw new Error("PIYOLOG_FEED_URL is not configured");
  }

  const [databaseUrl, feedUrl] = await Promise.all([
    resolveSecret(env.DATABASE_URL),
    resolveSecret(env.PIYOLOG_FEED_URL),
  ]);

  return {
    DATABASE_URL: databaseUrl,
    PIYOLOG_FEED_URL: feedUrl,
  };
}

async function resolveSecret(secret: SecretValue): Promise<string> {
  if (typeof secret === "string") {
    return secret;
  }

  return secret.get();
}
