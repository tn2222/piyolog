import {
  parsePiyologDataFeedSnapshot,
  type PiyologDataFeedSource,
  type PiyologDataFeedSnapshot,
} from "../../domain/piyologDataFeed";

export type PiyologDataFeedFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type PiyologDataFeedSourceOptions = {
  url: string;
  fetch?: PiyologDataFeedFetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  maxAttempts?: number;
  timeoutMs?: number;
};

export class PiyologDataFeedSourceError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.name = "PiyologDataFeedSourceError";
    this.code = code;
    this.status = status;
  }
}

export class HttpPiyologDataFeedSource implements PiyologDataFeedSource {
  private readonly url: string;
  private readonly fetchImpl: PiyologDataFeedFetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;

  constructor(options: PiyologDataFeedSourceOptions) {
    validateUrl(options.url);
    this.url = options.url;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? sleep;
    this.random = options.random ?? Math.random;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.timeoutMs = options.timeoutMs ?? 10_000;

    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new PiyologDataFeedSourceError(
        "invalid_configuration",
        "Feed retry attempts must be a positive integer",
      );
    }
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new PiyologDataFeedSourceError(
        "invalid_configuration",
        "Feed timeout must be positive",
      );
    }
  }

  async getDataFeed(): Promise<PiyologDataFeedSnapshot> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.request();
      } catch (error) {
        if (attempt === this.maxAttempts) {
          throw error;
        }

        await this.sleep(retryDelay(attempt, this.random));
        continue;
      }

      if (response.ok) {
        return parseResponse(response);
      }

      const retryable =
        response.status === 429 || (response.status >= 500 && response.status <= 599);
      if (!retryable || attempt === this.maxAttempts) {
        throw new PiyologDataFeedSourceError(
          "http_error",
          "Piyolog data feed request returned an unsuccessful status",
          response.status,
        );
      }

      await this.sleep(retryDelay(attempt, this.random));
    }

    throw new PiyologDataFeedSourceError("request_failed", "Piyolog data feed request failed");
  }

  private async request(): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchImpl(this.url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch {
      throw new PiyologDataFeedSourceError("request_failed", "Piyolog data feed request failed");
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createPiyologDataFeedSource(
  options: PiyologDataFeedSourceOptions,
): PiyologDataFeedSource {
  return new HttpPiyologDataFeedSource(options);
}

async function parseResponse(response: Response): Promise<PiyologDataFeedSnapshot> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new PiyologDataFeedSourceError(
      "invalid_json",
      "Piyolog data feed response was not valid JSON",
    );
  }

  return parsePiyologDataFeedSnapshot(payload);
}

function validateUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new PiyologDataFeedSourceError(
      "invalid_configuration",
      "Piyolog data feed URL is invalid",
    );
  }
}

function retryDelay(attempt: number, random: () => number): number {
  const jitter = Math.min(Math.max(random(), 0), 1);
  return 1_000 * 2 ** (attempt - 1) * (0.5 + jitter);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
