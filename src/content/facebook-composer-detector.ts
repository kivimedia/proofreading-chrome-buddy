import { ComposeInstance } from "./compose-instance";
import { FACEBOOK_CONFIG } from "./paragraph-differ";
import { ensureRewriteController } from "./rewrite-controller";

// Facebook's main composer (feed posts, comments, marketplace descriptions,
// group posts) is always rendered as a contenteditable with role=textbox
// using Meta's Lexical editor. Search boxes, chat header inputs, and a few
// other things ALSO match that selector, so we filter by aria-label.
const FB_SELECTOR = '[contenteditable="true"][role="textbox"]';

// Include if the aria-label looks like a composer.
const INCLUDE_RE = /post|comment|mind|message|reply|describe|write|share/i;
// Exclude if it's a search box, name field, etc.
const EXCLUDE_RE = /search|find|name|emoji|filter/i;

const MIN_HEIGHT_PX = 24;

const instances = new Map<HTMLElement, ComposeInstance>();

function isLikelyComposer(editor: HTMLElement): boolean {
  const label = editor.getAttribute("aria-label") ?? "";
  if (label) {
    if (EXCLUDE_RE.test(label)) return false;
    if (INCLUDE_RE.test(label)) return true;
  }
  // No label or unrecognized: accept if it's big enough to plausibly be a
  // post composer rather than a one-line chat / search input.
  const rect = editor.getBoundingClientRect();
  return rect.height >= MIN_HEIGHT_PX;
}

function attach(editor: HTMLElement): void {
  if (instances.has(editor)) return;
  if (!editor.isConnected) return;
  if (!isLikelyComposer(editor)) return;
  instances.set(editor, new ComposeInstance(editor, FACEBOOK_CONFIG));
}

function scan(root: ParentNode): void {
  const editors = root.querySelectorAll<HTMLElement>(FB_SELECTOR);
  for (const el of Array.from(editors)) attach(el);
  if (root instanceof HTMLElement && root.matches?.(FB_SELECTOR)) {
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
  "[proofreading-chrome-buddy] facebook content script loaded in",
  location.href,
);
