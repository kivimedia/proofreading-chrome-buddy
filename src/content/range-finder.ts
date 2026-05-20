import { isInvisible } from "./paragraph-differ";

// Given a paragraph block and VISIBLE-character offsets [start, end) within
// the block's normalised textContent, return a DOM Range covering that span.
//
// "Visible character" = textContent character that survives the
// normalisation in paragraph-differ.blockText (NBSP becomes a regular space
// and counts as 1 visible char; zero-width / bidi / formatting chars are
// stripped and DO NOT count).
//
// The model returns offsets in visible-char space (because that's what
// snapshotEditor sends it). We map those back to DOM offsets here so the
// Range covers exactly the intended characters even if Lexical interleaves
// invisible chars between visible ones.
export function findRangeInBlock(
  block: HTMLElement,
  start: number,
  end: number,
): Range | null {
  if (start < 0 || end < start) return null;

  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let visibleAcc = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  for (
    let node = walker.nextNode() as Text | null;
    node;
    node = walker.nextNode() as Text | null
  ) {
    const data = node.data;
    const vlen = visibleLength(data);

    if (startNode === null && visibleAcc + vlen > start) {
      startNode = node;
      startOffset = visibleToDomOffset(data, start - visibleAcc);
    }
    if (visibleAcc + vlen >= end) {
      endNode = node;
      endOffset = visibleToDomOffset(data, end - visibleAcc);
      break;
    }
    visibleAcc += vlen;
  }

  if (!startNode || !endNode) return null;

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  } catch {
    return null;
  }
}

function visibleLength(data: string): number {
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    if (!isInvisible(data[i])) n++;
  }
  return n;
}

// Walk `data` looking for the DOM offset whose visible-prefix length equals
// `target`. Returns data.length if `target` is at or past the end.
function visibleToDomOffset(data: string, target: number): number {
  if (target <= 0) {
    // Skip leading invisibles so the Range doesn't start on an invisible char.
    let i = 0;
    while (i < data.length && isInvisible(data[i])) i++;
    return i;
  }
  let visiblePos = 0;
  for (let i = 0; i < data.length; i++) {
    if (visiblePos === target) return i;
    if (!isInvisible(data[i])) visiblePos++;
  }
  return data.length;
}
