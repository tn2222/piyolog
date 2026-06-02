import { parseDateRange, type DateRange } from "./periods";

export const metricNames = [
  "milk_amount",
  "sleep_duration",
  "diaper_count",
  "event_count",
] as const;

const aggregationNames = ["sum", "count", "average"] as const;
const compareGroupByNames = ["none", "day", "week"] as const;
const summaryGranularityNames = ["none", "day", "week", "month"] as const;

export type MetricName = (typeof metricNames)[number];
export type AggregationName = (typeof aggregationNames)[number];
export type CompareGroupByName = (typeof compareGroupByNames)[number];
export type SummaryGranularityName = (typeof summaryGranularityNames)[number];

export type CompareMetricToolCall = {
  toolName: "compare_metric";
  arguments: {
    metric: MetricName;
    currentRange: DateRange;
    previousRange: DateRange;
    aggregation: AggregationName;
    groupBy: CompareGroupByName;
  };
};

export type SummarizePeriodToolCall = {
  toolName: "summarize_period";
  arguments: {
    range: DateRange;
    granularity: SummaryGranularityName;
    includeMetrics: MetricName[];
  };
};

export type BabyLogToolCall = CompareMetricToolCall | SummarizePeriodToolCall;

export type BabyLogToolDefinition = {
  name: BabyLogToolCall["toolName"];
  description: string;
  parameters: Record<string, unknown>;
};

export function parseBabyLogToolCall(input: unknown): BabyLogToolCall {
  const toolCall = tryParseBabyLogToolCall(input);
  if (toolCall === null) {
    throw new Error("Invalid baby log tool call");
  }
  return toolCall;
}

export function getBabyLogToolDefinitions(): BabyLogToolDefinition[] {
  return [
    {
      name: "compare_metric",
      description: "育児ログの指標を2つの期間で比較する",
      parameters: {
        type: "object",
        properties: {
          metric: { type: "string", enum: [...metricNames] },
          currentRange: dateRangeSchema(),
          previousRange: dateRangeSchema(),
          aggregation: { type: "string", enum: [...aggregationNames] },
          groupBy: { type: "string", enum: [...compareGroupByNames] },
        },
        required: ["metric", "currentRange", "previousRange", "aggregation", "groupBy"],
      },
    },
    {
      name: "summarize_period",
      description: "指定期間の育児ログをサマリーする",
      parameters: {
        type: "object",
        properties: {
          range: dateRangeSchema(),
          granularity: { type: "string", enum: [...summaryGranularityNames] },
          includeMetrics: {
            type: "array",
            items: { type: "string", enum: [...metricNames] },
            minItems: 1,
          },
        },
        required: ["range", "granularity", "includeMetrics"],
      },
    },
  ];
}

function tryParseBabyLogToolCall(input: unknown): BabyLogToolCall | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  if (record.toolName === "compare_metric") {
    return parseCompareMetricToolCall(record.arguments);
  }
  if (record.toolName === "summarize_period") {
    return parseSummarizePeriodToolCall(record.arguments);
  }

  return null;
}

function parseCompareMetricToolCall(input: unknown): CompareMetricToolCall | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const metric = parseEnum(record.metric, metricNames);
  const currentRange = parseDateRange(record.currentRange);
  const previousRange = parseDateRange(record.previousRange);
  const aggregation = parseEnum(record.aggregation, aggregationNames);
  const groupBy = parseEnum(record.groupBy, compareGroupByNames);

  if (
    metric === null ||
    currentRange === null ||
    previousRange === null ||
    aggregation === null ||
    groupBy === null
  ) {
    return null;
  }

  return {
    toolName: "compare_metric",
    arguments: {
      metric,
      currentRange,
      previousRange,
      aggregation,
      groupBy,
    },
  };
}

function parseSummarizePeriodToolCall(input: unknown): SummarizePeriodToolCall | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const range = parseDateRange(record.range);
  const granularity = parseEnum(record.granularity, summaryGranularityNames);
  const includeMetrics = parseMetricList(record.includeMetrics);

  if (range === null || granularity === null || includeMetrics === null) {
    return null;
  }

  return {
    toolName: "summarize_period",
    arguments: {
      range,
      granularity,
      includeMetrics,
    },
  };
}

function parseMetricList(input: unknown): MetricName[] | null {
  if (!Array.isArray(input) || input.length === 0) {
    return null;
  }

  const metrics = input.map((value) => parseEnum(value, metricNames));
  if (metrics.some((value) => value === null)) {
    return null;
  }

  return [...new Set(metrics as MetricName[])];
}

function parseEnum<const T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
): T[number] | null {
  return typeof value === "string" && allowedValues.includes(value)
    ? value
    : null;
}

function dateRangeSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
    required: ["from", "to"],
  };
}
