// Phase 1: stub. Detects Gmail compose editors and logs them.
// Phase 2 will mount per-editor ComposeInstance + overlay renderer.

const EDITOR_SELECTOR =
  '[contenteditable="true"][aria-label*="Message Body"], [contenteditable="true"][g_editable="true"]';

const seen = new WeakSet<Element>();

function scan(root: ParentNode): void {
  const editors = root.querySelectorAll(EDITOR_SELECTOR);
  for (const el of Array.from(editors)) {
    if (seen.has(el)) continue;
    seen.add(el);
    attach(el as HTMLElement);
  }
}

function attach(editor: HTMLElement): void {
  // Placeholder log so we can confirm injection works in DevTools.
  // Phase 2: replace with `new ComposeInstance(editor)`.
  console.debug("[gmail-claude-assistant] compose editor detected", editor);
}

function start(): void {
  scan(document);
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of Array.from(r.addedNodes)) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          if (el.matches?.(EDITOR_SELECTOR)) {
            if (!seen.has(el)) {
              seen.add(el);
              attach(el as HTMLElement);
            }
          }
          scan(el);
        }
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}

console.debug("[gmail-claude-assistant] content script loaded in", location.href);
