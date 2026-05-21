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
import { buildSystemPrompt } from "@/shared/build-system-prompt";
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
    ignoreWords: Array.isArray(s?.ignoreWords) ? s.ignoreWords : [],
  };
}

function filterIgnored(
  suggestions: Suggestion[],
  ignoreWords: string[],
): Suggestion[] {
  if (ignoreWords.length === 0) return suggestions;
  const ignore = new Set(
    ignoreWords.map((w) => w.trim().toLowerCase()).filter(Boolean),
  );
  return suggestions.filter(
    (s) => !ignore.has(s.original.trim().toLowerCase()),
  );
}

// Reconcile model-returned suggestions against the actual paragraph text.
// Claude is mostly accurate at character offsets but slips, especially on
// long paragraphs or when correcting words near the end. Failure mode we've
// seen: model returns start/end that cover "on pulrp" when it meant to
// cover "pulrpsew" + replacement "purpose", producing partial-word output
// like "purposesew". This validator:
//   1. Drops suggestions whose paragraph_index is unknown.
//   2. If text.slice(start, end) does not equal original, searches the
//      paragraph for original near the claimed start and patches the offsets.
//   3. Drops suggestions whose final start/end land mid-word (a letter
//      immediately before start, or immediately after end), because applying
//      them would leave word fragments dangling.
function reconcileSuggestions(
  paragraphs: Paragraph[],
  suggestions: Suggestion[],
): Suggestion[] {
  const byIndex = new Map(paragraphs.map((p) => [p.index, p.text]));
  const out: Suggestion[] = [];
  for (const s of suggestions) {
    const text = byIndex.get(s.paragraph_index);
    if (text === undefined) continue;
    if (typeof s.original !== "string" || s.original.length === 0) continue;

    let { start, end } = s;
    if (text.slice(start, end) !== s.original) {
      const hint = typeof start === "number" ? start : 0;
      const located = findClosestOccurrence(text, s.original, hint);
      if (located === -1) {
        console.warn(
          "[proofreading-chrome-buddy] dropping suggestion: original not found in paragraph",
          { paragraph_index: s.paragraph_index, original: s.original },
        );
        continue;
      }
      start = located;
      end = located + s.original.length;
    }

    if (straddlesWordBoundary(text, start, end)) {
      console.warn(
        "[proofreading-chrome-buddy] dropping suggestion: range cuts a word",
        { paragraph_index: s.paragraph_index, original: s.original, start, end },
      );
      continue;
    }

    out.push({ ...s, start, end });
  }
  return out;
}

function findClosestOccurrence(
  text: string,
  needle: string,
  hint: number,
): number {
  let best = -1;
  let bestDist = Infinity;
  let idx = text.indexOf(needle);
  while (idx !== -1) {
    const dist = Math.abs(idx - hint);
    if (dist < bestDist) {
      best = idx;
      bestDist = dist;
    }
    idx = text.indexOf(needle, idx + 1);
  }
  return best;
}

// Returns true if [start, end) cuts through a word: i.e. the character
// immediately before start is a word char AND start itself is a word char,
// or the same for end. Word char = letter (unicode) or digit.
function straddlesWordBoundary(text: string, start: number, end: number): boolean {
  const isWord = (c: string | undefined) =>
    c !== undefined && /[\p{L}\p{N}]/u.test(c);
  if (start > 0 && isWord(text[start - 1]) && isWord(text[start])) return true;
  if (end < text.length && isWord(text[end - 1]) && isWord(text[end])) return true;
  return false;
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
    system: buildSystemPrompt(SUGGEST_SYSTEM_PROMPT, settings, "suggest"),
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
  out.suggestions = reconcileSuggestions(paragraphs, out.suggestions);
  out.suggestions = filterIgnored(out.suggestions, settings.ignoreWords);
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
    system: buildSystemPrompt(REWRITE_SYSTEM_PROMPT, settings, "rewrite"),
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
    system: buildSystemPrompt(REPLY_SYSTEM_PROMPT, settings, "reply"),
    cacheSystem: true,
    messages: [{ role: "user", content: userMsg }],
    tool: REPLY_TOOL,
    maxTokens: 1500,
  });
  await recordUsage(res.usage);
  const out = extractToolInput<{ drafts: ReplyDraft[] }>(res, REPLY_TOOL.name);
  return { ok: true, data: out };
}

async function handleIgnoreWord(
  word: string,
): Promise<BackgroundResponse<{ ignoreWords: string[] }>> {
  const w = word.trim();
  if (!w) return { ok: false, error: "Empty word" };
  const settings = await getSettings();
  const lower = w.toLowerCase();
  const exists = settings.ignoreWords.some((x) => x.toLowerCase() === lower);
  if (!exists) {
    const next = [...settings.ignoreWords, w];
    await setSettings({ ignoreWords: next });
    return { ok: true, data: { ignoreWords: next } };
  }
  return { ok: true, data: { ignoreWords: settings.ignoreWords } };
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
          case "ignore_word":
            sendResponse(await handleIgnoreWord(msg.word));
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

/**
 * Compile-time seed for voiceProfile + customInstructions + ignoreWords. Read
 * by vite.config.ts from $HOME/private/proofreading-buddy-bootstrap.json at
 * build time. The actual file is NEVER tracked - if no file exists at build,
 * the value is `null` and the bootstrap path is a no-op. Even if a future
 * build has a seed, the writer below only fires when the user's current
 * voiceProfile is empty - it never overwrites edits. (Type lives in
 * src/globals.d.ts.)
 */
async function maybeBootstrapVoice(): Promise<void> {
  // typeof check makes the dead-code-elimination path obvious when the
  // define is `null` at build time.
  const seed = typeof __BOOTSTRAP_VOICE__ !== "undefined" ? __BOOTSTRAP_VOICE__ : null;
  if (!seed) return;
  const current = await getSettings();
  if ((current.voiceProfile ?? "").trim().length > 0) return; // user already has one
  const merged: Partial<ExtensionSettings> = {};
  if (typeof seed.voiceProfile === "string" && seed.voiceProfile.trim()) {
    merged.voiceProfile = seed.voiceProfile;
  }
  // Only seed customInstructions if empty - never overwrite a user edit.
  if (
    typeof seed.customInstructions === "string" &&
    seed.customInstructions.trim() &&
    !(current.customInstructions ?? "").trim()
  ) {
    merged.customInstructions = seed.customInstructions;
  }
  // Ignore words: union, dedupe (case-insensitive).
  if (Array.isArray(seed.ignoreWords) && seed.ignoreWords.length > 0) {
    const have = new Set(current.ignoreWords.map((w) => w.toLowerCase()));
    const additions = seed.ignoreWords.filter(
      (w) => typeof w === "string" && w.trim() && !have.has(w.toLowerCase()),
    );
    if (additions.length > 0) {
      merged.ignoreWords = [...current.ignoreWords, ...additions];
    }
  }
  if (Object.keys(merged).length === 0) return;
  await setSettings(merged);
  console.log(
    "[proofreading-chrome-buddy] voice bootstrap loaded into chrome.storage.local " +
      `(voiceProfile=${(merged.voiceProfile ?? "").length} chars, ` +
      `customInstructions=${(merged.customInstructions ?? "").length} chars, ` +
      `ignoreWords += ${(merged.ignoreWords ?? []).length - current.ignoreWords.length})`,
  );
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await getSettings();
  await setSettings(current); // normalizes shape on upgrade
  await maybeBootstrapVoice();
});

// Service-worker cold-start (after MV3 idle eviction). Fires on Chrome browser
// startup AND - for unpacked extensions - after a manual reload. Belt and
// braces with onInstalled so the bootstrap always runs at least once after
// a fresh build, regardless of which event fires first.
chrome.runtime.onStartup.addListener(async () => {
  await maybeBootstrapVoice();
});

// Also run at module load time so the very first service-worker invocation
// (which fires before onInstalled in some edge cases) still seeds. The check
// inside maybeBootstrapVoice makes repeat invocations safe.
void maybeBootstrapVoice();
