import { describe, expect, it } from "vitest";
import { askAssistant } from "../src/application/askAssistantUseCase";
import type { LlmGatewayInterface } from "../src/gateway/llmGatewayClient";
import type {
  CompareMetricInput,
  PiyologRepositoryInterface,
  SummarizePeriodInput,
  TextExportInput,
} from "../src/types";

class FakeRepository implements PiyologRepositoryInterface {
  public comparedMetrics: CompareMetricInput[] = [];
  public summarizedPeriods: SummarizePeriodInput[] = [];

  async insertTextExport(_input: TextExportInput) {
    return { id: null };
  }

  async upsertDiaries() {
    throw new Error("unreachable");
  }

  async deleteEventsByDates() {
    throw new Error("unreachable");
  }

  async insertEvents() {
    throw new Error("unreachable");
  }

  async compareMetric(input: CompareMetricInput) {
    this.comparedMetrics.push(input);
    return {
      metric: input.metric,
      currentRange: input.currentRange,
      previousRange: input.previousRange,
      rows: [
        { period: "previous", value: 4200, event_count: 28 },
        { period: "current", value: 4650, event_count: 31 },
      ],
    };
  }

  async summarizePeriod(input: SummarizePeriodInput) {
    this.summarizedPeriods.push(input);
    return {
      range: input.range,
      granularity: input.granularity,
      rows: [{ event_date: "2026-05-31", milk_amount: 650 }],
    };
  }
}

class FakeLlmGateway implements LlmGatewayInterface {
  public selectedToolRequests: unknown[] = [];
  public generatedAnswers: unknown[] = [];

  constructor(private readonly selectedTool: unknown) {}

  async selectTool(input: Parameters<LlmGatewayInterface["selectTool"]>[0]) {
    this.selectedToolRequests.push(input);
    return this.selectedTool;
  }

  async generateAnswer(input: Parameters<LlmGatewayInterface["generateAnswer"]>[0]) {
    this.generatedAnswers.push(input);
    return { text: "今週は先週よりミルク量が増えています。" };
  }
}

describe("askAssistant", () => {
  it("executes a selected compare_metric tool and generates an answer", async () => {
    const repository = new FakeRepository();
    const llmGateway = new FakeLlmGateway({
      toolName: "compare_metric",
      arguments: {
        metric: "milk_amount",
        currentRange: { from: "2026-05-24", to: "2026-05-31" },
        previousRange: { from: "2026-05-17", to: "2026-05-24" },
        aggregation: "sum",
        groupBy: "none",
      },
    });

    const result = await askAssistant({
      text: "先週と比べてミルク量増えた？",
      timezone: "Asia/Tokyo",
      now: new Date("2026-06-03T08:15:30+09:00"),
      repository,
      llmGateway,
    });

    expect(result).toEqual({
      ok: true,
      text: "今週は先週よりミルク量が増えています。",
    });
    expect(repository.comparedMetrics).toEqual([
      {
        metric: "milk_amount",
        currentRange: { from: "2026-05-24", to: "2026-05-31" },
        previousRange: { from: "2026-05-17", to: "2026-05-24" },
        aggregation: "sum",
        groupBy: "none",
      },
    ]);
    expect(llmGateway.selectedToolRequests).toEqual([
      {
        app: "piyolog",
        task: "tool_selection",
        modelPolicy: "fast",
        userText: "先週と比べてミルク量増えた？",
        tools: expect.any(Array),
        timezone: "Asia/Tokyo",
        now: "2026-06-03T08:15:30+09:00",
      },
    ]);
    expect(llmGateway.generatedAnswers).toEqual([
      {
        app: "piyolog",
        task: "answer_generation",
        modelPolicy: "balanced",
        userText: "先週と比べてミルク量増えた？",
        toolResults: [
          {
            toolName: "compare_metric",
            result: {
              metric: "milk_amount",
              currentRange: { from: "2026-05-24", to: "2026-05-31" },
              previousRange: { from: "2026-05-17", to: "2026-05-24" },
              rows: [
                { period: "previous", value: 4200, event_count: 28 },
                { period: "current", value: 4650, event_count: 31 },
              ],
            },
          },
        ],
        instructions: "医療診断は避け、記録に基づく家庭内の振り返りとして回答する。",
      },
    ]);
  });

  it("returns a safe error when the selected tool call is invalid", async () => {
    const result = await askAssistant({
      text: "先週と比べてミルク量増えた？",
      timezone: "Asia/Tokyo",
      repository: new FakeRepository(),
      llmGateway: new FakeLlmGateway({
        toolName: "compare_metric",
        arguments: {
          metric: "unknown_metric",
        },
      }),
    });

    expect(result).toEqual({
      ok: false,
      text: "うまく質問を読み取れませんでした。聞き方を少し変えてもう一度試してください。",
    });
  });

  it("returns a safe error when the LLM Gateway fails", async () => {
    const failingGateway: LlmGatewayInterface = {
      async selectTool() {
        throw new Error("gateway unavailable");
      },
      async generateAnswer() {
        throw new Error("unreachable");
      },
    };

    const result = await askAssistant({
      text: "昨日のまとめ",
      timezone: "Asia/Tokyo",
      repository: new FakeRepository(),
      llmGateway: failingGateway,
    });

    expect(result).toEqual({
      ok: false,
      text: "一時的にAIアシスタントを利用できません。少し時間を置いてもう一度試してください。",
    });
  });
});
