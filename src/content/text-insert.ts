// Insert plain text into a contenteditable, replacing the given range,
// while preserving the host app's undo stack as much as possible.
//
// Verified strategies (tested live on playground.lexical.dev):
//   1. document.execCommand('insertText', ...) - works on Gmail AND Lexical.
//      Preserves the host's native undo stack.
//   2. Synthetic InputEvent('beforeinput', inputType='insertReplacementText')
//      - works on Lexical (it cancels the event and applies the change
//      through its own model). Most other contenteditable hosts ignore it.
//
// NOT used (proven destructive on Lexical):
//   - Direct DOM mutation via range.deleteContents() + range.insertNode().
//     On Lexical, this initially appears to work but the reconciler nukes
//     our injected text on its next render tick AND doesn't restore the
//     original - leaving the user with a deletion + nothing. This is the
//     "first Accept did nothing" bug. We refuse to do this and surface the
//     failure instead.
export type InsertStrategy = "execCommand" | "inputEvent" | "failed";

export function insertTextIntoEditor(
  editor: HTMLElement,
  range: Range,
  text: string,
): InsertStrategy {
  if (!editor.isConnected) return "failed";

  editor.focus();
  const sel = window.getSelection();
  if (!sel) return "failed";
  sel.removeAllRanges();
  try {
    sel.addRange(range);
  } catch {
    return "failed";
  }

  // Strategy 1: execCommand. Returns true if it accepted the operation.
  try {
    if (document.execCommand("insertText", false, text)) {
      return "execCommand";
    }
  } catch {
    /* fallthrough */
  }

  // Strategy 2: synthesize a beforeinput. Lexical listens for this and
  // applies the change in its own model. If a listener calls
  // preventDefault (dispatchEvent returns false), we count that as success.
  try {
    const ev = new InputEvent("beforeinput", {
      inputType: "insertReplacementText",
      data: text,
      bubbles: true,
      cancelable: true,
    });
    const dispatched = editor.dispatchEvent(ev);
    if (!dispatched) return "inputEvent";
  } catch {
    /* fallthrough */
  }

  console.warn(
    "[proofreading-chrome-buddy] insertion failed: neither execCommand nor beforeinput took the change. Skipping rather than corrupting the editor.",
  );
  return "failed";
}
