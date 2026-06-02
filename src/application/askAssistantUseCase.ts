import {
  getBabyLogToolDefinitions,
  parseBabyLogToolCall,
  type BabyLogToolCall,
} from "../domain/tools";
import type { LlmGatewayInterface } from "../gateway/llmGatewayClient";
import type { PiyologRepositoryInterface } from "../types";

export type AskAssistantInput = {
  text: string;
  timezone: string;
  repository: PiyologRepositoryInterface;
  llmGateway: LlmGatewayInterface;
};

export type AskAssistantResult =
  | {
      ok: true;
      text: string;
    }
  | {
      ok: false;
      text: string;
    };

const answerInstructions =
  "医療診断は避け、記録に基づく家庭内の振り返りとして回答する。";

export async function askAssistant(input: AskAssistantInput): Promise<AskAssistantResult> {
  let selectedTool: unknown;
  try {
    selectedTool = await input.llmGateway.selectTool({
      app: "piyolog",
      task: "tool_selection",
      modelPolicy: "fast",
      userText: input.text,
      tools: getBabyLogToolDefinitions(),
      timezone: input.timezone,
    });
  } catch (error) {
    console.error("Failed to select baby log tool", summarizeError(error));
    return {
      ok: false,
      text: "一時的にAIアシスタントを利用できません。少し時間を置いてもう一度試してください。",
    };
  }

  let toolCall: BabyLogToolCall;
  try {
    toolCall = parseBabyLogToolCall(selectedTool);
  } catch {
    return {
      ok: false,
      text: "うまく質問を読み取れませんでした。聞き方を少し変えてもう一度試してください。",
    };
  }

  try {
    const toolResult = await executeToolCall(toolCall, input.repository);
    const answer = await input.llmGateway.generateAnswer({
      app: "piyolog",
      task: "answer_generation",
      modelPolicy: "balanced",
      userText: input.text,
      toolResults: [
        {
          toolName: toolCall.toolName,
          result: toolResult,
        },
      ],
      instructions: answerInstructions,
    });

    return {
      ok: true,
      text: answer.text,
    };
  } catch (error) {
    console.error("Failed to answer baby log question", summarizeError(error));
    return {
      ok: false,
      text: "一時的にAIアシスタントを利用できません。少し時間を置いてもう一度試してください。",
    };
  }
}

async function executeToolCall(
  toolCall: BabyLogToolCall,
  repository: PiyologRepositoryInterface,
): Promise<unknown> {
  switch (toolCall.toolName) {
    case "compare_metric":
      return repository.compareMetric(toolCall.arguments);
    case "summarize_period":
      return repository.summarizePeriod(toolCall.arguments);
  }
}

function summarizeError(error: unknown): { name: string } {
  return {
    name: error instanceof Error ? error.name : typeof error,
  };
}
