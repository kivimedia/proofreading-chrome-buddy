// Given a paragraph block and character offsets [start, end) within the
// block's textContent, return a DOM Range covering that span.
export function findRangeInBlock(
  block: HTMLElement,
  start: number,
  end: number,
): Range | null {
  if (start < 0 || end < start) return null;

  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  for (
    let node = walker.nextNode() as Text | null;
    node;
    node = walker.nextNode() as Text | null
  ) {
    const len = node.data.length;
    if (startNode === null && pos + len > start) {
      startNode = node;
      startOffset = Math.max(0, start - pos);
    }
    if (pos + len >= end) {
      endNode = node;
      endOffset = Math.min(len, end - pos);
      break;
    }
    pos += len;
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
