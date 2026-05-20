import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
} from "@floating-ui/dom";
import type {
  BackgroundMessage,
  BackgroundResponse,
} from "@/shared/types";
import { insertTextIntoEditor } from "./text-insert";

interface SelectionContext {
  editor: HTMLElement;
  range: Range;
  text: string;
}

interface Preset {
  label: string;
  instruction: string;
}

const PRESETS: Preset[] = [
  { label: "Default", instruction: "" },
  { label: "Concise", instruction: "more concise" },
  { label: "Friendlier", instruction: "friendlier and warmer" },
  { label: "More formal", instruction: "more formal and professional" },
];

const EDITOR_SELECTOR =
  '[contenteditable="true"][aria-label*="Message Body"], [contenteditable="true"][g_editable="true"]';

const SHADOW_CSS = `
:host { all: initial; }

div.float-btn {
  position: absolute;
  top: 0; left: 0;
  background: #5b6ef5;
  color: #ffffff;
  padding: 6px 12px;
  border-radius: 999px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
  user-select: none;
  pointer-events: auto;
  will-change: transform;
  display: flex;
  align-items: center;
  gap: 4px;
}
div.float-btn:hover { background: #4554c8; }
div.float-btn.hidden { display: none; }

div.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  pointer-events: auto;
}
div.backdrop.hidden { display: none; }

div.modal {
  background: #ffffff;
  color: #1a1f36;
  border-radius: 12px;
  width: min(640px, 92vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.3);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
div.modal .head {
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e3e8ee;
}
div.modal .head h2 { margin: 0; font-size: 16px; font-weight: 600; }
div.modal .head .close {
  background: none;
  border: none;
  font-size: 22px;
  color: #697386;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  font-family: inherit;
}
div.modal .presets {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid #f1f3f6;
  flex-wrap: wrap;
}
div.modal .preset {
  padding: 5px 12px;
  background: #f1f3f6;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  color: #1a1f36;
}
div.modal .preset.active {
  background: #e6efff;
  border-color: #5b6ef5;
  color: #2347a8;
  font-weight: 500;
}
div.modal .body {
  flex: 1;
  overflow: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
div.modal .panel { display: flex; flex-direction: column; gap: 6px; }
div.modal .panel-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #4f566b;
  font-weight: 600;
}
div.modal .panel-text {
  padding: 12px 14px;
  border-radius: 6px;
  background: #f7f8fa;
  color: #1a1f36;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 56px;
}
div.modal .panel-text.loading { color: #697386; font-style: italic; }
div.modal .panel-text.error { background: #fdecec; color: #a82424; }
div.modal .panel.rewrite .panel-text { background: #e6f7ed; }
div.modal .foot {
  padding: 12px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #e3e8ee;
}
div.modal button.action {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
}
div.modal button.cancel {
  background: #ffffff;
  color: #4f566b;
  border-color: #cbd2dc;
}
div.modal button.cancel:hover { background: #f1f3f6; }
div.modal button.apply {
  background: #5b6ef5;
  color: #ffffff;
  border-color: #5b6ef5;
}
div.modal button.apply:hover { background: #4554c8; }
div.modal button.apply:disabled {
  background: #cbd2dc;
  border-color: #cbd2dc;
  cursor: not-allowed;
}
`;

class RewriteController {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private floatBtn: HTMLDivElement;
  private backdrop: HTMLDivElement;

  private current: SelectionContext | null = null;
  private autoCleanup: (() => void) | null = null;

  private rewriteText: string = "";
  private rewriteError: string | null = null;
  private activePreset: Preset = PRESETS[0];
  private requestId = 0;

  constructor() {
    this.host = document.createElement("div");
    this.host.setAttribute("data-gca-rewrite", "");
    this.host.style.cssText =
      "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483641;";
    this.shadow = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = SHADOW_CSS;
    this.shadow.appendChild(style);

    this.floatBtn = document.createElement("div");
    this.floatBtn.className = "float-btn hidden";
    this.floatBtn.textContent = "✨ Rewrite";
    // Prevent button mousedown from clearing the selection in the editor.
    this.floatBtn.addEventListener("mousedown", (e) => e.preventDefault());
    this.floatBtn.addEventListener("click", () => this.openModal());
    this.shadow.appendChild(this.floatBtn);

    this.backdrop = document.createElement("div");
    this.backdrop.className = "backdrop hidden";
    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop) this.closeModal();
    });
    this.shadow.appendChild(this.backdrop);

    document.documentElement.appendChild(this.host);

    document.addEventListener("selectionchange", () => this.onSelectionChange());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.backdrop.classList.contains("hidden")) {
        this.closeModal();
      }
    });
  }

  private onSelectionChange(): void {
    if (!this.backdrop.classList.contains("hidden")) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      this.hideFloatBtn();
      return;
    }
    const range = sel.getRangeAt(0);
    const editor = findOwningEditor(range);
    if (!editor) {
      this.hideFloatBtn();
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 3) {
      this.hideFloatBtn();
      return;
    }
    this.current = { editor, range: range.cloneRange(), text };
    this.showFloatBtn(range);
  }

  private showFloatBtn(range: Range): void {
    this.floatBtn.classList.remove("hidden");
    const anchor: { getBoundingClientRect: () => DOMRect } = {
      getBoundingClientRect: () => range.getBoundingClientRect(),
    };
    if (this.autoCleanup) this.autoCleanup();
    this.autoCleanup = autoUpdate(
      anchor as Element,
      this.floatBtn,
      () => {
        void computePosition(anchor as Element, this.floatBtn, {
          placement: "top",
          middleware: [offset(8), flip(), shift({ padding: 8 })],
        }).then(({ x, y }) => {
          this.floatBtn.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        });
      },
    );
  }

  private hideFloatBtn(): void {
    this.floatBtn.classList.add("hidden");
    if (this.autoCleanup) {
      this.autoCleanup();
      this.autoCleanup = null;
    }
  }

  private openModal(): void {
    if (!this.current) return;
    this.hideFloatBtn();
    this.activePreset = PRESETS[0];
    this.rewriteText = "";
    this.rewriteError = null;
    this.renderModal();
    this.backdrop.classList.remove("hidden");
    void this.fetchRewrite();
  }

  private renderModal(): void {
    this.backdrop.replaceChildren();
    const modal = document.createElement("div");
    modal.className = "modal";

    const head = document.createElement("div");
    head.className = "head";
    const h2 = document.createElement("h2");
    h2.textContent = "Rewrite with Claude";
    head.appendChild(h2);
    const close = document.createElement("button");
    close.className = "close";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.addEventListener("click", () => this.closeModal());
    head.appendChild(close);
    modal.appendChild(head);

    const presets = document.createElement("div");
    presets.className = "presets";
    for (const p of PRESETS) {
      const btn = document.createElement("button");
      btn.className =
        "preset" + (p.label === this.activePreset.label ? " active" : "");
      btn.textContent = p.label;
      btn.addEventListener("click", () => {
        if (this.activePreset.label === p.label) return;
        this.activePreset = p;
        this.rewriteText = "";
        this.rewriteError = null;
        this.renderModal();
        void this.fetchRewrite();
      });
      presets.appendChild(btn);
    }
    modal.appendChild(presets);

    const body = document.createElement("div");
    body.className = "body";

    body.appendChild(
      buildPanel("Original", this.current?.text ?? "", "original"),
    );
    body.appendChild(
      buildRewritePanel(this.rewriteText, this.rewriteError),
    );
    modal.appendChild(body);

    const foot = document.createElement("div");
    foot.className = "foot";
    const cancel = document.createElement("button");
    cancel.className = "action cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.closeModal());
    foot.appendChild(cancel);
    const apply = document.createElement("button");
    apply.className = "action apply";
    apply.textContent = "Apply";
    apply.disabled = this.rewriteText === "" || this.rewriteError !== null;
    apply.addEventListener("click", () => this.applyRewrite());
    foot.appendChild(apply);
    modal.appendChild(foot);

    this.backdrop.appendChild(modal);
  }

  private async fetchRewrite(): Promise<void> {
    if (!this.current) return;
    const myId = ++this.requestId;
    try {
      const res = (await chrome.runtime.sendMessage({
        kind: "rewrite",
        text: this.current.text,
        instruction: this.activePreset.instruction || undefined,
      } as BackgroundMessage)) as BackgroundResponse<{ rewrite: string }>;
      if (myId !== this.requestId) return;
      if (res.ok && res.data) {
        this.rewriteText = res.data.rewrite;
        this.rewriteError = null;
      } else {
        this.rewriteError = res.error ?? "Unknown error";
      }
    } catch (e) {
      if (myId !== this.requestId) return;
      this.rewriteError = e instanceof Error ? e.message : String(e);
    }
    if (!this.backdrop.classList.contains("hidden")) this.renderModal();
  }

  private applyRewrite(): void {
    if (!this.current) return;
    if (this.rewriteText === "" || this.rewriteError) return;
    insertTextIntoEditor(
      this.current.editor,
      this.current.range,
      this.rewriteText,
    );
    this.closeModal();
  }

  private closeModal(): void {
    this.backdrop.classList.add("hidden");
    this.current = null;
    this.requestId++;
  }
}

function findOwningEditor(range: Range): HTMLElement | null {
  let node: Node | null = range.commonAncestorContainer;
  while (node) {
    if (node instanceof HTMLElement && node.matches?.(EDITOR_SELECTOR)) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function buildPanel(
  label: string,
  text: string,
  kind: "original" | "rewrite",
): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = `panel ${kind}`;
  const lab = document.createElement("div");
  lab.className = "panel-label";
  lab.textContent = label;
  panel.appendChild(lab);
  const t = document.createElement("div");
  t.className = "panel-text";
  t.textContent = text;
  panel.appendChild(t);
  return panel;
}

function buildRewritePanel(
  rewriteText: string,
  error: string | null,
): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = "panel rewrite";
  const lab = document.createElement("div");
  lab.className = "panel-label";
  lab.textContent = "Rewrite";
  panel.appendChild(lab);
  const t = document.createElement("div");
  t.className = "panel-text";
  if (error) {
    t.classList.add("error");
    t.textContent = error;
  } else if (rewriteText === "") {
    t.classList.add("loading");
    t.textContent = "Asking Claude...";
  } else {
    t.textContent = rewriteText;
  }
  panel.appendChild(t);
  return panel;
}

let instance: RewriteController | null = null;
export function ensureRewriteController(): void {
  if (!instance) instance = new RewriteController();
}
