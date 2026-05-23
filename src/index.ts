import { handleTextRecordsRequest } from "./handler";
import { createTiDBPiyologRepository } from "./repository";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/api/text-records") {
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
        status: 404,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      });
    }

    return handleTextRecordsRequest(request, env, () =>
      createTiDBPiyologRepository(env.DATABASE_URL),
    );
  },
};
