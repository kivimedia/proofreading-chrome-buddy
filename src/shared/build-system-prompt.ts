/**
 * Composes the final system prompt that the background sends to Anthropic
 * for a given surface (suggest / rewrite / reply). Lives in src/shared so
 * the options page can render an accurate preview of what is actually being
 * sent - no second source of truth, no drift.
 *
 * Pure function. No imports from chrome.* or fetch - safe to call from any
 * extension context.
 */
import type { ExtensionSettings } from "./types";

export type Surface = "suggest" | "rewrite" | "reply";

export function buildSystemPrompt(
  base: string,
  settings: ExtensionSettings,
  kind: Surface,
): string {
  let prompt = base;
  const ci = settings.customInstructions.trim();
  const vs = settings.voiceSamples.trim();
  const vp = settings.voiceProfile.trim();
  const grade = Number.isFinite(settings.targetGrade) ? settings.targetGrade : 0;

  if (kind === "rewrite" || kind === "reply") {
    if (vs) {
      prompt += `\n\nThe user's writing voice. Match their tone, vocabulary, sentence rhythm, and level of formality:\n"""\n${vs}\n"""`;
    }
  }

  // Voice profile is the full coaching ruleset. Unlike voiceSamples (which is
  // examples) this is meta-instructions about HOW to write. Inject on all
  // surfaces - including suggest - so even a single-word spelling fix's
  // explanation lands in the user's voice.
  if (vp) {
    prompt += `\n\nThe user's voice and coaching rules. Treat these as binding instructions about HOW you write any user-facing string (suggestion explanations, rewrites, reply bodies):\n"""\n${vp}\n"""`;
  }

  // Hemingway grade target. 0 means "no target". Otherwise emit a tight
  // clause so the model knows the ceiling.
  if (grade >= 2 && grade <= 14) {
    prompt += `\n\nReading-level target (Hemingway grade ${grade}): every user-facing string you produce - suggestion explanations, rewrites, reply bodies - must read at or below US grade ${grade}. Use short sentences. Prefer common words over technical ones. Avoid passive voice unless required for accuracy. Avoid multi-clause sentences when a period works. Replace bureaucratic verbs (utilize, leverage, facilitate, implement) with plain ones (use, help, do). When in doubt, shorter wins.`;
  }

  if (ci) {
    prompt += `\n\nUser's additional preferences (apply these to your output):\n${ci}`;
  }

  if (kind === "suggest" && settings.ignoreWords.length > 0) {
    const list = settings.ignoreWords
      .map((w) => w.trim())
      .filter(Boolean)
      .join(", ");
    if (list) {
      prompt += `\n\nNever flag these words as misspellings or errors (they are intentional and personal to the user): ${list}`;
    }
  }

  return prompt;
}
