import { ComposeInstance } from "./compose-instance";
import { FACEBOOK_CONFIG } from "./paragraph-differ";
import { installPopupRouter } from "./popup-router";
import { ensureRewriteController } from "./rewrite-controller";

// Match any contenteditable with role=textbox. We accept both "true" and
// "plaintext-only" because Lexical (Meta's editor) can use either.
const FB_SELECTOR = '[contenteditable][role="textbox"]';

// Hard exclusions only - default is INCLUDE. Hebrew/RTL aria-labels won't
// match English allow-lists, so any keyword-based include-list is too
// brittle. We block search/chat metadata fields (case-insensitive,
// English + Hebrew) and let everything else through.
const EXCLUDE_KEYWORDS = [
  "search",
  "filter",
  "emoji",
  "find friend",
  "first name",
  "last name",
  "your name",
  "phone",
  "password",
  "email",
  "username",
  "url",
  "חיפוש", // Hebrew: search
  "סנן", // Hebrew: filter
];

const MIN_HEIGHT_PX = 18;

const instances = new Map<HTMLElement, ComposeInstance>();

function isLikelyComposer(editor: HTMLElement): boolean {
  const label = (editor.getAttribute("aria-label") ?? "").toLowerCase();
  for (const kw of EXCLUDE_KEYWORDS) {
    if (label.includes(kw.toLowerCase())) {
      console.debug(
        "[proofreading-chrome-buddy] FB skip (excluded label):",
        label,
      );
      return false;
    }
  }
  const rect = editor.getBoundingClientRect();
  if (rect.height > 0 && rect.height < MIN_HEIGHT_PX) {
    console.debug(
      "[proofreading-chrome-buddy] FB skip (too short):",
      rect.height,
      "label:",
      label,
    );
    return false;
  }
  return true;
}

function attach(editor: HTMLElement): void {
  if (instances.has(editor)) return;
  if (!editor.isConnected) return;
  if (!isLikelyComposer(editor)) return;
  console.debug(
    "[proofreading-chrome-buddy] FB composer attached:",
    editor.getAttribute("aria-label") || "(no aria-label)",
  );
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
  "[proofreading-chrome-buddy] facebook content script loaded in",
  location.href,
);
