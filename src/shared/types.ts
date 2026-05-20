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
  | "claude-opus-4-7";

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
