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
  now?: Date;
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
      now: formatDateTimeWithOffset(input.now ?? new Date(), input.timezone),
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
  } catch (error) {
    console.error("Invalid baby log tool selection", {
      error: summarizeError(error),
      selectedTool: summarizeJson(selectedTool),
    });
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

function summarizeError(error: unknown): { name: string; message: string } {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
  };
}

function summarizeJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 2_000);
  } catch {
    return "[unserializable]";
  }
}

function formatDateTimeWithOffset(date: Date, timezone: string): string {
  const parts = formatDateTimeParts(date, timezone);
  const offsetMinutes = calculateTimezoneOffsetMinutes(date, parts);

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${formatOffset(offsetMinutes)}`;
}

function formatDateTimeParts(date: Date, timezone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

function calculateTimezoneOffsetMinutes(
  date: Date,
  parts: Record<string, string>,
): number {
  const zonedTimeAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return Math.round((zonedTimeAsUtc - date.getTime()) / 60_000);
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");

  return `${sign}${hours}:${minutes}`;
}
