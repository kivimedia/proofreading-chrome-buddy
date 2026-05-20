import type { Paragraph } from "@/shared/types";

export interface EditorSnapshot {
  paragraphs: Paragraph[];
  paragraphNodes: HTMLElement[];
}

// Gmail compose: top-level <div> per visual line; empty line = <div><br></div>.
// We treat each direct child block element as one "paragraph". When the
// editor has no block children (rare initial state), the editor itself is one.
export function snapshotEditor(editor: HTMLElement): EditorSnapshot {
  const blocks = collectBlocks(editor);
  const paragraphs: Paragraph[] = blocks.map((block, i) => ({
    index: i,
    text: blockText(block),
    hash: "",
  }));
  for (const p of paragraphs) p.hash = hashString(p.text);
  return { paragraphs, paragraphNodes: blocks };
}

// Skip quoted history (replies/forwards) and the user's own signature -
// the user doesn't want grammar/spelling flags on either.
const EXCLUDE_SELECTOR = ".gmail_quote, blockquote, .gmail_signature";

function collectBlocks(editor: HTMLElement): HTMLElement[] {
  const direct = Array.from(editor.children).filter(
    (c): c is HTMLElement =>
      c instanceof HTMLElement && !c.matches(EXCLUDE_SELECTOR),
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
