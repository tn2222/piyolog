import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeDatabaseDateTime } from "../scripts/formula-notifier-time.mjs";

describe("formula notifier", () => {
  it("defaults to notifying 35 minutes before the next formula time", () => {
    const script = readFileSync("scripts/formula-notifier.mjs", "utf8");

    expect(script).toContain(
      "const notifyBeforeMinutes = parsePositiveInteger(process.env.FORMULA_NOTIFY_BEFORE_MINUTES, 35);",
    );
  });

  it("reads UTC formula records from the public feed projection", () => {
    const script = readFileSync("scripts/formula-notifier.mjs", "utf8");
    const timeHelper = readFileSync("scripts/formula-notifier-time.mjs", "utf8");

    expect(script).toContain("FROM piyolog_feed_events");
    expect(script).toContain("WHERE event_type = 'Formula'");
    expect(script).toContain("UTC_TIMESTAMP()");
    expect(timeHelper).toContain('timeZone: "Asia/Tokyo"');
  });

  it("converts UTC database values to JST for notification text", () => {
    expect(normalizeDatabaseDateTime("2026-09-16 00:10:00.123")).toBe(
      "2026-09-16 09:10:00",
    );
  });
});
