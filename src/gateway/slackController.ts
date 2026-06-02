import type { AskAssistantResult } from "../application/askAssistantUseCase";

type SlackCommandDependencies = {
  slackCommandToken: string;
  askAssistant(text: string): Promise<AskAssistantResult>;
};

export async function handleSlackCommandRequest(
  request: Request,
  dependencies: SlackCommandDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const form = await request.formData();
  if (form.get("token") !== dependencies.slackCommandToken) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const text = form.get("text");
  const result = await dependencies.askAssistant(typeof text === "string" ? text : "");

  return jsonResponse(
    {
      response_type: "ephemeral",
      text: result.text,
    },
    200,
  );
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}
