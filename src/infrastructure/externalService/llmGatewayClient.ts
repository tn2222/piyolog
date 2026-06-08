import type { BabyLogToolCall, BabyLogToolDefinition } from "../../domain/tools";

export type ToolSelectionRequest = {
  app: "piyolog";
  task: "tool_selection";
  modelPolicy: "fast" | "balanced";
  userText: string;
  tools: BabyLogToolDefinition[];
  timezone: string;
  now: string;
};

export type AnswerGenerationRequest = {
  app: "piyolog";
  task: "answer_generation";
  modelPolicy: "fast" | "balanced";
  userText: string;
  toolResults: Array<{
    toolName: BabyLogToolCall["toolName"];
    result: unknown;
  }>;
  instructions: string;
};

export type AnswerGenerationResult = {
  text: string;
};

export type LlmGatewayInterface = {
  selectTool(input: ToolSelectionRequest): Promise<unknown>;
  generateAnswer(input: AnswerGenerationRequest): Promise<AnswerGenerationResult>;
};

type Fetch = typeof fetch;

export class HttpLlmGatewayClient implements LlmGatewayInterface {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetch: Fetch;

  constructor(input: { baseUrl: string; token: string; fetch?: Fetch }) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, "");
    this.token = input.token;
    this.fetch = input.fetch ?? ((request, init) => fetch(request, init));
  }

  async selectTool(input: ToolSelectionRequest): Promise<unknown> {
    return this.postJson("/v1/tool-selection", input);
  }

  async generateAnswer(input: AnswerGenerationRequest): Promise<AnswerGenerationResult> {
    const response = await this.postJson("/v1/generate", input);
    if (!isAnswerGenerationResult(response)) {
      throw new Error("Invalid LLM Gateway generate response");
    }
    return response;
  }

  private async postJson(path: string, body: unknown): Promise<unknown> {
    let response: Response;
    const fetchJson = this.fetch;
    try {
      response = await fetchJson(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(`LLM Gateway fetch failed: ${path}: ${errorMessage(error)}`);
    }

    if (!response.ok) {
      throw new Error(`LLM Gateway request failed: ${response.status}`);
    }

    try {
      return await response.json();
    } catch (error) {
      throw new Error(`LLM Gateway JSON parse failed: ${path}: ${errorMessage(error)}`);
    }
  }
}

function isAnswerGenerationResult(input: unknown): input is AnswerGenerationResult {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    typeof (input as { text?: unknown }).text === "string"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
