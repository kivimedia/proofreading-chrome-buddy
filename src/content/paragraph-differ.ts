import type { Paragraph } from "@/shared/types";

export interface EditorSnapshot {
  paragraphs: Paragraph[];
  paragraphNodes: HTMLElement[];
}

export interface PlatformConfig {
  /** "children" -> each direct block child of the editor is a paragraph
   *  (Gmail). "single" -> the entire editor is one paragraph (Facebook /
   *  Lexical, where the inner DOM re-renders aggressively). */
  blockStrategy: "children" | "single";
  /** CSS selector to filter out (e.g. quoted history, signature). Empty
   *  string means "no exclusions". */
  excludeSelector: string;
  /** Whether the reply-drafts UI applies on this platform. */
  enableReplyAssist: boolean;
}

export const GMAIL_CONFIG: PlatformConfig = {
  blockStrategy: "children",
  excludeSelector: ".gmail_quote, blockquote, .gmail_signature",
  enableReplyAssist: true,
};

export const FACEBOOK_CONFIG: PlatformConfig = {
  blockStrategy: "single",
  excludeSelector: "",
  enableReplyAssist: false,
};

// Zero-width / bidi / formatting chars that show up in textContent but are
// visually invisible. Lexical (Facebook's editor) injects these between text
// nodes for caret positioning + RTL handling, which otherwise throws off
// char-offset math (model sees mangled text + Range positions are shifted
// inside DOM nodes).
//
// Codepoints covered:
//   U+200B..U+200F  zero-width space / non-joiner / joiner / LRM / RLM
//   U+202A..U+202E  bidi controls (LRE/RLE/PDF/LRO/RLO)
//   U+2060          word joiner
//   U+FEFF          BOM / zero-width no-break space
export function isInvisible(c: string): boolean {
  const code = c.charCodeAt(0);
  return (
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    code === 0x2060 ||
    code === 0xfeff
  );
}

const NBSP = String.fromCharCode(0xa0);
const INVISIBLE_REPLACE_RE = new RegExp(
  // NBSP captured separately so we can replace with a regular space rather
  // than stripping it.
  `${NBSP}|[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF]`,
  "g",
);

function normaliseTextForModel(raw: string): string {
  return raw.replace(INVISIBLE_REPLACE_RE, (m) => (m === NBSP ? " " : ""));
}

export function snapshotEditor(
  editor: HTMLElement,
  config: PlatformConfig = GMAIL_CONFIG,
): EditorSnapshot {
  const blocks = collectBlocks(editor, config);
  const paragraphs: Paragraph[] = blocks.map((block, i) => ({
    index: i,
    text: blockText(block),
    hash: "",
  }));
  for (const p of paragraphs) p.hash = hashString(p.text);
  return { paragraphs, paragraphNodes: blocks };
}

function collectBlocks(
  editor: HTMLElement,
  config: PlatformConfig,
): HTMLElement[] {
  if (config.blockStrategy === "single") return [editor];
  const direct = Array.from(editor.children).filter(
    (c): c is HTMLElement => {
      if (!(c instanceof HTMLElement)) return false;
      if (config.excludeSelector && c.matches(config.excludeSelector)) {
        return false;
      }
      return true;
    },
  );
  if (direct.length === 0) return [editor];
  return direct;
}

function blockText(block: HTMLElement): string {
  return normaliseTextForModel(block.textContent ?? "");
}

// djb2; collision-resistant enough for short paragraphs given we also
// include the length suffix.
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36) + "_" + s.length;
}

// Returns paragraphs whose hash is NOT present in `prev`. This handles the
// "user inserted a paragraph at the top" case better than index-keyed diff:
// shifted-but-unchanged paragraphs reuse their cached suggestions instead of
// re-billing.
export function diffParagraphs(
  prev: Paragraph[],
  next: Paragraph[],
): Paragraph[] {
  const prevHashes = new Set(prev.map((p) => p.hash));
  return next.filter(
    (p) => !prevHashes.has(p.hash) && p.text.trim().length > 0,
  );
}
