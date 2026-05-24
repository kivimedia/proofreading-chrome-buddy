import { ComposeInstance } from "./compose-instance";
import { GMAIL_CONFIG } from "./paragraph-differ";
import { installPopupRouter } from "./popup-router";
import { ensureRewriteController } from "./rewrite-controller";

// Multi-selector so we survive Gmail UI locale changes (aria-label localizes
// per language) and the eventual deprecation of `g_editable`. The third entry
// matches Gmail's ARIA-compliant body editor by structure (multiline textbox
// that is contenteditable) and works regardless of language or DOM rename.
// `i` flag on the aria-label selector tolerates "Message Body" vs "Message body".
const EDITOR_SELECTOR = [
  '[contenteditable="true"][aria-label*="Message Body" i]',
  '[contenteditable="true"][g_editable="true"]',
  '[contenteditable="true"][role="textbox"][aria-multiline="true"]',
].join(", ");

const instances = new Map<HTMLElement, ComposeInstance>();

function attach(editor: HTMLElement): void {
  if (instances.has(editor)) return;
  if (!editor.isConnected) return;
  instances.set(editor, new ComposeInstance(editor, GMAIL_CONFIG));
}

function scan(root: ParentNode): void {
  const editors = root.querySelectorAll<HTMLElement>(EDITOR_SELECTOR);
  for (const el of Array.from(editors)) attach(el);
  if (root instanceof HTMLElement && root.matches?.(EDITOR_SELECTOR)) {
    attach(root);
  }
}

function reapDetached(): void {
  for (const [editor, inst] of instances) {
    if (!editor.isConnected) {
      inst.destroy();
      instances.delete(editor);
    }
  }
}

function start(): void {
  ensureRewriteController();
  installPopupRouter(instances);
  scan(document);
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of Array.from(r.addedNodes)) {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node as ParentNode);
      }
      if (r.removedNodes.length > 0) reapDetached();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}

console.debug(
  "[proofreading-chrome-buddy] gmail content script loaded in",
  location.href,
);
