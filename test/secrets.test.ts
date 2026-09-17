import { describe, expect, it } from "vitest";
import { resolvePiyologDataFeedSecrets, resolveSecrets } from "../src/secrets";
import type { Env } from "../src/types";

describe("resolveSecrets", () => {
  it("returns plain string secrets for local development", async () => {
    const secrets = await resolveSecrets({
      INGEST_TOKEN: "local-ingest-token",
      DATABASE_URL: "mysql://local",
      SLACK_COMMAND_TOKEN: "local-slack-token",
      PERSONAL_LLM_GATEWAY_URL: "https://llm.local",
      PERSONAL_LLM_GATEWAY_TOKEN: "local-gateway-token",
      LINE_CHANNEL_SECRET: "local-line-secret",
      LINE_CHANNEL_ACCESS_TOKEN: "local-line-access-token",
    });

    expect(secrets).toEqual({
      INGEST_TOKEN: "local-ingest-token",
      DATABASE_URL: "mysql://local",
      SLACK_COMMAND_TOKEN: "local-slack-token",
      PERSONAL_LLM_GATEWAY_URL: "https://llm.local",
      PERSONAL_LLM_GATEWAY_TOKEN: "local-gateway-token",
      LINE_CHANNEL_SECRET: "local-line-secret",
      LINE_CHANNEL_ACCESS_TOKEN: "local-line-access-token",
    });
  });

  it("resolves Secrets Store bindings with get()", async () => {
    const env = {
      INGEST_TOKEN: secretBinding("store-ingest-token"),
      DATABASE_URL: secretBinding("mysql://store"),
      SLACK_COMMAND_TOKEN: secretBinding("store-slack-token"),
      PERSONAL_LLM_GATEWAY_URL: secretBinding("https://llm.store"),
      PERSONAL_LLM_GATEWAY_TOKEN: secretBinding("store-gateway-token"),
      LINE_CHANNEL_SECRET: secretBinding("store-line-secret"),
      LINE_CHANNEL_ACCESS_TOKEN: secretBinding("store-line-access-token"),
    } satisfies Env;

    await expect(resolveSecrets(env)).resolves.toEqual({
      INGEST_TOKEN: "store-ingest-token",
      DATABASE_URL: "mysql://store",
      SLACK_COMMAND_TOKEN: "store-slack-token",
      PERSONAL_LLM_GATEWAY_URL: "https://llm.store",
      PERSONAL_LLM_GATEWAY_TOKEN: "store-gateway-token",
      LINE_CHANNEL_SECRET: "store-line-secret",
      LINE_CHANNEL_ACCESS_TOKEN: "store-line-access-token",
    });
  });

  it("resolves only the database and feed URL for scheduled sync", async () => {
    await expect(
      resolvePiyologDataFeedSecrets({
        DATABASE_URL: secretBinding("mysql://store"),
        PIYOLOG_FEED_URL: secretBinding("https://feed.example/secret"),
      }),
    ).resolves.toEqual({
      DATABASE_URL: "mysql://store",
      PIYOLOG_FEED_URL: "https://feed.example/secret",
    });
  });

  it("fails scheduled sync configuration without a feed URL", async () => {
    await expect(
      resolvePiyologDataFeedSecrets({ DATABASE_URL: "mysql://local" }),
    ).rejects.toThrow("PIYOLOG_FEED_URL is not configured");
  });
});

function secretBinding(value: string) {
  return {
    async get() {
      return value;
    },
  };
}
