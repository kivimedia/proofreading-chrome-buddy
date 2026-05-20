// Insert plain text into a contenteditable, replacing the given range,
// while preserving the host app's undo stack as much as possible.
//
// Tries three strategies in order:
//   1. document.execCommand('insertText', false, text). Works in Gmail and
//      most classic contenteditable surfaces - preserves the native undo
//      stack as one step.
//   2. dispatch a beforeinput event with inputType='insertReplacementText'.
//      Used by Lexical (Meta's editor on Facebook) to route the change
//      through its model.
//   3. Direct DOM mutation: range.deleteContents() + range.insertNode(text).
//      Last-resort; may leak through Lexical's reconciler and cause weird
//      duplication, but at least applies the change visually.
//
// Returns the strategy that succeeded, for logging/telemetry.
export type InsertStrategy = "execCommand" | "inputEvent" | "domMutation" | "failed";

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
  // Most contenteditable hosts (including Gmail) handle this natively.
  try {
    if (document.execCommand("insertText", false, text)) {
      return "execCommand";
    }
  } catch {
    /* fallthrough */
  }

  // Strategy 2: synthesize a beforeinput. Lexical listens for this and
  // applies the change in its own model. Other editors ignore it, so this
  // is safe to try unconditionally.
  try {
    const ev = new InputEvent("beforeinput", {
      inputType: "insertReplacementText",
      data: text,
      bubbles: true,
      cancelable: true,
    });
    const dispatched = editor.dispatchEvent(ev);
    // If the event was canceled by a listener (Lexical does this when it
    // handles the change itself), the editor's content has already been
    // updated by the handler. Treat that as success.
    if (!dispatched) return "inputEvent";
  } catch {
    /* fallthrough */
  }

  // Strategy 3: DOM mutation. Last resort.
  try {
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    return "domMutation";
  } catch {
    return "failed";
  }
}
