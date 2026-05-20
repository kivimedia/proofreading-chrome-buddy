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
  // Gmail uses U+00A0 (non-breaking space) for trailing/wrap spaces; normalize
  // so the model never sees it and our char offsets line up with what it sees.
  return (block.textContent ?? "").replace(/ /g, " ");
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
  return next.filter((p) => !prevHashes.has(p.hash) && p.text.trim().length > 0);
}
