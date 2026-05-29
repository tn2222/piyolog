import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("formula notifier", () => {
  it("defaults to notifying 35 minutes before the next formula time", () => {
    const script = readFileSync("scripts/formula-notifier.mjs", "utf8");

    expect(script).toContain(
      "const notifyBeforeMinutes = parsePositiveInteger(process.env.FORMULA_NOTIFY_BEFORE_MINUTES, 35);",
    );
  });
});
