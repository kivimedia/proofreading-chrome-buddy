import type { AnthropicUsage, ModelId } from "@/shared/types";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export type AnthropicContentBlock = AnthropicToolUseBlock | AnthropicTextBlock;

export interface AnthropicResponse {
  id: string;
  model: string;
  role: "assistant";
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage: AnthropicUsage;
}

export interface AnthropicCallOptions {
  apiKey: string;
  model: ModelId;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  tool?: {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  };
  maxTokens?: number;
  cacheSystem?: boolean;
}

export class AnthropicError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string,
  ) {
    super(message);
    this.name = "AnthropicError";
  }
}

export async function callAnthropic(
  opts: AnthropicCallOptions,
): Promise<AnthropicResponse> {
  if (!opts.apiKey) throw new AnthropicError("Missing API key", 401);

  const systemBlocks = opts.cacheSystem
    ? [
        {
          type: "text",
          text: opts.system,
          cache_control: { type: "ephemeral" },
        },
      ]
    : opts.system;

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    system: systemBlocks,
    messages: opts.messages,
  };

  if (opts.tool) {
    body.tools = [opts.tool];
    body.tool_choice = { type: "tool", name: opts.tool.name };
  }

  let lastError: AnthropicError | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": opts.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          // Required for direct browser/extension calls (CORS).
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return (await res.json()) as AnthropicResponse;
      }

      const errBody = await res.text();
      const retriable = res.status === 429 || res.status >= 500;
      lastError = new AnthropicError(
        `Anthropic API ${res.status}`,
        res.status,
        errBody,
      );
      if (!retriable) throw lastError;
      await sleep(500 * Math.pow(2, attempt));
    } catch (err) {
      if (err instanceof AnthropicError) throw err;
      lastError = new AnthropicError(
        err instanceof Error ? err.message : "network error",
        0,
      );
      await sleep(500 * Math.pow(2, attempt));
    }
  }
  throw lastError ?? new AnthropicError("Unknown failure", 0);
}

export function extractToolInput<T>(
  res: AnthropicResponse,
  toolName: string,
): T {
  const block = res.content.find(
    (c): c is AnthropicToolUseBlock =>
      c.type === "tool_use" && c.name === toolName,
  );
  if (!block) {
    throw new AnthropicError(
      `Expected tool_use block "${toolName}" not found`,
      0,
    );
  }
  return block.input as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
