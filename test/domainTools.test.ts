import { describe, expect, it } from "vitest";
import {
  getBabyLogToolDefinitions,
  parseBabyLogToolCall,
} from "../src/domain/tools";

describe("parseBabyLogToolCall", () => {
  it("accepts a valid compare_metric tool call", () => {
    const toolCall = parseBabyLogToolCall({
      toolName: "compare_metric",
      arguments: {
        metric: "milk_amount",
        currentRange: { from: "2026-05-24", to: "2026-05-31" },
        previousRange: { from: "2026-05-17", to: "2026-05-24" },
        aggregation: "sum",
        groupBy: "none",
      },
    });

    expect(toolCall).toEqual({
      toolName: "compare_metric",
      arguments: {
        metric: "milk_amount",
        currentRange: { from: "2026-05-24", to: "2026-05-31" },
        previousRange: { from: "2026-05-17", to: "2026-05-24" },
        aggregation: "sum",
        groupBy: "none",
      },
    });
  });

  it("rejects unknown metrics in compare_metric tool calls", () => {
    expect(() =>
      parseBabyLogToolCall({
        toolName: "compare_metric",
        arguments: {
          metric: "unknown_metric",
          currentRange: { from: "2026-05-24", to: "2026-05-31" },
          previousRange: { from: "2026-05-17", to: "2026-05-24" },
          aggregation: "sum",
          groupBy: "none",
        },
      }),
    ).toThrow("Invalid baby log tool call");
  });

  it("rejects invalid dates in compare_metric ranges", () => {
    expect(() =>
      parseBabyLogToolCall({
        toolName: "compare_metric",
        arguments: {
          metric: "milk_amount",
          currentRange: { from: "2026-05-31", to: "2026-05-24" },
          previousRange: { from: "2026-05-17", to: "2026-05-24" },
          aggregation: "sum",
          groupBy: "none",
        },
      }),
    ).toThrow("Invalid baby log tool call");
  });

  it("rejects compare_metric tool calls with missing required fields", () => {
    expect(() =>
      parseBabyLogToolCall({
        toolName: "compare_metric",
        arguments: {
          metric: "milk_amount",
          currentRange: { from: "2026-05-24", to: "2026-05-31" },
        },
      }),
    ).toThrow("Invalid baby log tool call");
  });

  it("accepts a valid summarize_period tool call", () => {
    const toolCall = parseBabyLogToolCall({
      toolName: "summarize_period",
      arguments: {
        range: { from: "2026-05-01", to: "2026-06-01" },
        granularity: "day",
        includeMetrics: ["milk_amount", "sleep_duration", "diaper_count"],
      },
    });

    expect(toolCall).toEqual({
      toolName: "summarize_period",
      arguments: {
        range: { from: "2026-05-01", to: "2026-06-01" },
        granularity: "day",
        includeMetrics: ["milk_amount", "sleep_duration", "diaper_count"],
      },
    });
  });

  it("normalizes ISO datetime ranges from the LLM Gateway", () => {
    const toolCall = parseBabyLogToolCall({
      toolName: "summarize_period",
      arguments: {
        range: {
          from: "2026-06-02T00:00:00+09:00",
          to: "2026-06-02T23:59:59+09:00",
        },
        granularity: "day",
        includeMetrics: ["milk_amount", "sleep_duration", "diaper_count"],
      },
    });

    expect(toolCall).toEqual({
      toolName: "summarize_period",
      arguments: {
        range: { from: "2026-06-02", to: "2026-06-03" },
        granularity: "day",
        includeMetrics: ["milk_amount", "sleep_duration", "diaper_count"],
      },
    });
  });

  it("rejects summarize_period tool calls without metrics", () => {
    expect(() =>
      parseBabyLogToolCall({
        toolName: "summarize_period",
        arguments: {
          range: { from: "2026-05-01", to: "2026-06-01" },
          granularity: "day",
          includeMetrics: [],
        },
      }),
    ).toThrow("Invalid baby log tool call");
  });

  it("rejects summarize_period ranges longer than 35 days", () => {
    expect(() =>
      parseBabyLogToolCall({
        toolName: "summarize_period",
        arguments: {
          range: { from: "2026-05-01", to: "2026-06-06" },
          granularity: "day",
          includeMetrics: ["milk_amount", "sleep_duration", "diaper_count"],
        },
      }),
    ).toThrow("Invalid baby log tool call");
  });

  it("accepts summarize_period ranges up to 35 days", () => {
    const toolCall = parseBabyLogToolCall({
      toolName: "summarize_period",
      arguments: {
        range: { from: "2026-05-01", to: "2026-06-05" },
        granularity: "day",
        includeMetrics: ["milk_amount", "sleep_duration", "diaper_count"],
      },
    });

    expect(toolCall).toEqual({
      toolName: "summarize_period",
      arguments: {
        range: { from: "2026-05-01", to: "2026-06-05" },
        granularity: "day",
        includeMetrics: ["milk_amount", "sleep_duration", "diaper_count"],
      },
    });
  });
});

describe("getBabyLogToolDefinitions", () => {
  it("returns the MVP tool definitions for the LLM Gateway", () => {
    expect(getBabyLogToolDefinitions().map((tool) => tool.name)).toEqual([
      "compare_metric",
      "summarize_period",
    ]);
  });
});
