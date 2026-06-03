import type { AskAssistantResult } from "../application/askAssistantUseCase";

type SlackCommandDependencies = {
  slackCommandToken: string;
  askAssistant(text: string): Promise<AskAssistantResult>;
  waitUntil(task: Promise<void>): void;
  fetch?: typeof fetch;
};

export async function handleSlackCommandRequest(
  request: Request,
  dependencies: SlackCommandDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const form = await request.formData();
  if (form.get("token") !== dependencies.slackCommandToken) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const text = form.get("text");
  const commandText = typeof text === "string" ? text : "";
  const responseUrl = form.get("response_url");

  if (typeof responseUrl === "string" && responseUrl.length > 0) {
    dependencies.waitUntil(
      postAssistantResult(responseUrl, commandText, dependencies),
    );

    return jsonResponse(
      {
        response_type: "ephemeral",
        text: "育児ログを確認しています。少し待ってください。",
      },
      200,
    );
  }

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

async function postAssistantResult(
  responseUrl: string,
  text: string,
  dependencies: SlackCommandDependencies,
): Promise<void> {
  const result = await dependencies.askAssistant(text);
  const post = dependencies.fetch ?? fetch;

  await post(responseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      response_type: "ephemeral",
      text: result.text,
    }),
  });
}
