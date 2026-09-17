import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public feed consumers and schedule configuration", () => {
  it("uses the feed projection and explicit JST conversion in Grafana queries", () => {
    const grafana = readFileSync("docs/grafana.md", "utf8");

    expect(grafana).toContain("FROM piyolog_feed_events");
    expect(grafana).toContain("WHERE event_type = 'Formula'");
    expect(grafana).toContain("CONVERT_TZ");
  });

  it("configures the five-minute Worker schedule and feed secret", () => {
    const wrangler = readFileSync("wrangler.jsonc", "utf8");

    expect(wrangler).toContain('"crons": ["*/5 * * * *"]');
    expect(wrangler).toContain('"binding": "PIYOLOG_FEED_URL"');
    expect(readFileSync(".dev.vars.example", "utf8")).toContain("PIYOLOG_FEED_URL=");
  });
});
