export type SuggestionCategory =
  | "spelling"
  | "grammar"
  | "clarity"
  | "conciseness"
  | "tone";

export interface Suggestion {
  paragraph_index: number;
  start: number;
  end: number;
  category: SuggestionCategory;
  original: string;
  replacement: string;
  explanation: string;
}

export interface ReplyDraft {
  label: "formal" | "friendly" | "brief";
  body: string;
}

export interface Paragraph {
  index: number;
  text: string;
  hash: string;
}

export interface UsageStats {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  calls: number;
}

export type ModelId =
  | "claude-haiku-4-5-20251001"
  | "claude-sonnet-4-6"
  | "claude-opus-4-7"
  | "claude-opus-4-8";

export interface ExtensionSettings {
  apiKey: string;
  model: ModelId;
  features: {
    grammarSpelling: boolean;
    clarityTone: boolean;
    rewriteParagraph: boolean;
    replyDrafts: boolean;
  };
  debounceMs: number;
  /** Free-text examples of the user's voice (sample emails). Used for
   *  rewrite + reply prompts to make Claude match their tone. */
  voiceSamples: string;
  /** Free-text style guide / preferences applied to all surfaces. */
  customInstructions: string;
  /** Lowercased words/phrases the suggester must never flag. */
  ignoreWords: string[];
  /** PRIVATE: full coaching/voice ruleset (e.g. how the user has trained their
   *  writing coach to think). When non-empty, injected into the system prompt
   *  on ALL surfaces (suggest, rewrite, reply) so suggestions, rewrites, and
   *  reply drafts match the user's coached voice end-to-end.
   *
   *  PRIVACY NOTE FOR FUTURE CONTRIBUTORS: this field's content is highly
   *  personal. Never commit example content, never log it to console, never
   *  bundle a fixture with real rules. It lives only in chrome.storage.local
   *  on the user's machine. The .gitignore at the repo root has patterns
   *  protecting against accidental commits of voice files. */
  voiceProfile: string;
  /** Hemingway-style target reading grade level. Drives the prompt to keep
   *  every suggestion + explanation at or below this grade. 4 = elementary,
   *  8 = the Hemingway-app default for general writing, 12 = senior in high
   *  school. Set to 0 to disable. */
  targetGrade: number;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiKey: "",
  model: "claude-haiku-4-5-20251001",
  features: {
    grammarSpelling: true,
    clarityTone: true,
    rewriteParagraph: true,
    replyDrafts: true,
  },
  debounceMs: 1500,
  voiceSamples: "",
  customInstructions: "",
  ignoreWords: [],
  voiceProfile: "",
  targetGrade: 8,
};

export type BackgroundMessage =
  | { kind: "ping"; apiKey?: string; model?: ModelId }
  | { kind: "check"; paragraphs: Paragraph[]; model?: ModelId }
  | { kind: "rewrite"; text: string; instruction?: string; model?: ModelId }
  | {
      kind: "reply_drafts";
      thread: { from: string; body: string }[];
      userName?: string;
      model?: ModelId;
    }
  | { kind: "get_usage" }
  | { kind: "get_settings" }
  | { kind: "set_settings"; settings: Partial<ExtensionSettings> }
  | { kind: "ignore_word"; word: string };

/** Messages the popup sends DIRECTLY to the active tab's content script
 *  (not through the background). Content-script listeners route these to the
 *  most-recently-active ComposeInstance. */
export type TabMessage =
  | { kind: "fix_now" }
  | { kind: "accept_all" };

/** Result of a tab message - content script reports outcome so the popup can
 *  show feedback (n suggestions applied, no composer focused, etc.). */
export interface TabResponse {
  ok: boolean;
  /** Human-readable status (e.g. "Applied 4 suggestions", "No composer in
   *  focus", "Fetching new suggestions..."). Shown in the popup. */
  status?: string;
  /** Count of suggestions touched, when applicable. */
  count?: number;
  error?: string;
}

export interface BackgroundResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}
