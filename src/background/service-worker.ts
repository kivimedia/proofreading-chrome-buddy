import {
  AnthropicError,
  callAnthropic,
  extractToolInput,
} from "./anthropic-client";
import {
  REPLY_SYSTEM_PROMPT,
  REPLY_TOOL,
  REWRITE_SYSTEM_PROMPT,
  REWRITE_TOOL,
  SUGGEST_SYSTEM_PROMPT,
  SUGGEST_TOOL,
} from "@/shared/prompts";
import {
  DEFAULT_SETTINGS,
  type BackgroundMessage,
  type BackgroundResponse,
  type ExtensionSettings,
  type Paragraph,
  type ReplyDraft,
  type Suggestion,
  type UsageStats,
} from "@/shared/types";

const SETTINGS_KEY = "settings";
const USAGE_KEY = "usage";

async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const s = stored[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...(s ?? {}),
    features: { ...DEFAULT_SETTINGS.features, ...(s?.features ?? {}) },
  };
}

async function setSettings(patch: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  const next: ExtensionSettings = {
    ...current,
    ...patch,
    features: { ...current.features, ...(patch.features ?? {}) },
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function recordUsage(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}): Promise<void> {
  const stored = await chrome.storage.local.get(USAGE_KEY);
  const date = todayKey();
  const current: UsageStats = (stored[USAGE_KEY] as UsageStats | undefined) ?? {
    date,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    calls: 0,
  };
  const fresh: UsageStats =
    current.date === date
      ? current
      : {
          date,
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
          calls: 0,
        };
  fresh.input_tokens += usage.input_tokens;
  fresh.output_tokens += usage.output_tokens;
  fresh.cache_read_tokens += usage.cache_read_input_tokens ?? 0;
  fresh.cache_creation_tokens += usage.cache_creation_input_tokens ?? 0;
  fresh.calls += 1;
  await chrome.storage.local.set({ [USAGE_KEY]: fresh });
}

async function handlePing(
  apiKey?: string,
  model?: string,
): Promise<BackgroundResponse<{ model: string }>> {
  const settings = await getSettings();
  const key = apiKey ?? settings.apiKey;
  const useModel = (model ?? settings.model) as ExtensionSettings["model"];
  if (!key) return { ok: false, error: "No API key configured" };

  const res = await callAnthropic({
    apiKey: key,
    model: useModel,
    system: "Reply with the single word: pong.",
    messages: [{ role: "user", content: "ping" }],
    maxTokens: 10,
  });
  await recordUsage(res.usage);
  return { ok: true, data: { model: res.model } };
}

async function handleCheck(
  paragraphs: Paragraph[],
  model?: string,
): Promise<BackgroundResponse<{ suggestions: Suggestion[] }>> {
  const settings = await getSettings();
  if (!settings.apiKey) return { ok: false, error: "No API key configured" };
  if (paragraphs.length === 0) return { ok: true, data: { suggestions: [] } };

  const userMsg = paragraphs
    .map((p) => `[paragraph ${p.index}]\n${p.text}`)
    .join("\n\n");

  const res = await callAnthropic({
    apiKey: settings.apiKey,
    model: (model ?? settings.model) as ExtensionSettings["model"],
    system: SUGGEST_SYSTEM_PROMPT,
    cacheSystem: true,
    messages: [{ role: "user", content: userMsg }],
    tool: SUGGEST_TOOL,
    maxTokens: 2048,
  });
  await recordUsage(res.usage);
  const out = extractToolInput<{ suggestions: Suggestion[] }>(
    res,
    SUGGEST_TOOL.name,
  );
  return { ok: true, data: out };
}

async function handleRewrite(
  text: string,
  instruction: string | undefined,
  model?: string,
): Promise<BackgroundResponse<{ rewrite: string }>> {
  const settings = await getSettings();
  if (!settings.apiKey) return { ok: false, error: "No API key configured" };
  const userMsg = instruction
    ? `Instruction: ${instruction}\n\nPassage:\n${text}`
    : `Passage:\n${text}`;
  const res = await callAnthropic({
    apiKey: settings.apiKey,
    model: (model ?? settings.model) as ExtensionSettings["model"],
    system: REWRITE_SYSTEM_PROMPT,
    cacheSystem: true,
    messages: [{ role: "user", content: userMsg }],
    tool: REWRITE_TOOL,
    maxTokens: 1024,
  });
  await recordUsage(res.usage);
  const out = extractToolInput<{ rewrite: string }>(res, REWRITE_TOOL.name);
  return { ok: true, data: out };
}

async function handleReplyDrafts(
  thread: { from: string; body: string }[],
  userName: string | undefined,
  model?: string,
): Promise<BackgroundResponse<{ drafts: ReplyDraft[] }>> {
  const settings = await getSettings();
  if (!settings.apiKey) return { ok: false, error: "No API key configured" };
  const threadStr = thread
    .map((m) => `From: ${m.from}\n\n${m.body}`)
    .join("\n\n---\n\n");
  const userMsg = `User's display name: ${userName ?? "(unknown)"}\n\nThread (oldest first):\n\n${threadStr}`;
  const res = await callAnthropic({
    apiKey: settings.apiKey,
    model: (model ?? settings.model) as ExtensionSettings["model"],
    system: REPLY_SYSTEM_PROMPT,
    cacheSystem: true,
    messages: [{ role: "user", content: userMsg }],
    tool: REPLY_TOOL,
    maxTokens: 1500,
  });
  await recordUsage(res.usage);
  const out = extractToolInput<{ drafts: ReplyDraft[] }>(res, REPLY_TOOL.name);
  return { ok: true, data: out };
}

chrome.runtime.onMessage.addListener(
  (msg: BackgroundMessage, _sender, sendResponse) => {
    (async () => {
      try {
        switch (msg.kind) {
          case "ping":
            sendResponse(await handlePing(msg.apiKey, msg.model));
            break;
          case "check":
            sendResponse(await handleCheck(msg.paragraphs, msg.model));
            break;
          case "rewrite":
            sendResponse(
              await handleRewrite(msg.text, msg.instruction, msg.model),
            );
            break;
          case "reply_drafts":
            sendResponse(
              await handleReplyDrafts(msg.thread, msg.userName, msg.model),
            );
            break;
          case "get_usage": {
            const stored = await chrome.storage.local.get(USAGE_KEY);
            sendResponse({
              ok: true,
              data: (stored[USAGE_KEY] as UsageStats | undefined) ?? null,
            });
            break;
          }
          case "get_settings":
            sendResponse({ ok: true, data: await getSettings() });
            break;
          case "set_settings":
            await setSettings(msg.settings);
            sendResponse({ ok: true, data: await getSettings() });
            break;
          default: {
            const _exhaustive: never = msg;
            sendResponse({
              ok: false,
              error: `Unknown message kind: ${JSON.stringify(_exhaustive)}`,
            });
          }
        }
      } catch (err) {
        const error =
          err instanceof AnthropicError
            ? `Anthropic ${err.status}: ${err.message}${err.body ? ` - ${err.body.slice(0, 200)}` : ""}`
            : err instanceof Error
              ? err.message
              : String(err);
        sendResponse({ ok: false, error });
      }
    })();
    return true; // keep channel open for async sendResponse
  },
);

chrome.runtime.onInstalled.addListener(async () => {
  const current = await getSettings();
  await setSettings(current); // normalizes shape on upgrade
});
