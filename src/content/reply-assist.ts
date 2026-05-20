import {
  autoUpdate,
  computePosition,
  offset,
  shift,
} from "@floating-ui/dom";
import type {
  BackgroundMessage,
  BackgroundResponse,
  ReplyDraft,
} from "@/shared/types";

const MAX_MESSAGES = 3;

const SHADOW_CSS = `
:host { all: initial; }

div.btn {
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
div.btn:hover { background: #4554c8; }
div.btn.hidden { display: none; }

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
  width: min(720px, 92vw);
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
div.modal .body {
  flex: 1;
  overflow: auto;
  padding: 16px 20px;
}
div.modal .state {
  padding: 24px 12px;
  text-align: center;
  color: #697386;
  font-size: 13px;
}
div.modal .state.error {
  color: #a82424;
  background: #fdecec;
  border-radius: 8px;
}
div.modal .drafts {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
div.modal .draft {
  border: 1px solid #e3e8ee;
  border-radius: 8px;
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
  background: #ffffff;
}
div.modal .draft:hover {
  border-color: #5b6ef5;
  background: #f6f8ff;
}
div.modal .draft .label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #4f566b;
  font-weight: 600;
  margin-bottom: 6px;
}
div.modal .draft .body-text {
  font-size: 14px;
  line-height: 1.55;
  color: #1a1f36;
  white-space: pre-wrap;
  word-break: break-word;
}
div.modal .draft .hint {
  font-size: 11px;
  color: #5b6ef5;
  margin-top: 8px;
}
div.modal .foot {
  padding: 12px 20px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid #e3e8ee;
}
div.modal button.action {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid #cbd2dc;
  background: #ffffff;
  color: #4f566b;
}
div.modal button.action:hover { background: #f1f3f6; }
`;

export class ReplyAssist {
  private editor: HTMLElement;
  private conversation: HTMLElement;
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private btn: HTMLDivElement;
  private backdrop: HTMLDivElement;
  private destroyed = false;
  private autoCleanup: (() => void) | null = null;

  private drafts: ReplyDraft[] = [];
  private loading = false;
  private error: string | null = null;
  private requestId = 0;

  constructor(editor: HTMLElement, conversation: HTMLElement) {
    this.editor = editor;
    this.conversation = conversation;

    this.host = document.createElement("div");
    this.host.setAttribute("data-gca-reply-assist", "");
    this.host.style.cssText =
      "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483641;";
    this.shadow = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = SHADOW_CSS;
    this.shadow.appendChild(style);

    this.btn = document.createElement("div");
    this.btn.className = "btn";
    this.btn.textContent = "✨ Suggest replies";
    this.btn.addEventListener("click", () => this.openModal());
    this.shadow.appendChild(this.btn);

    this.backdrop = document.createElement("div");
    this.backdrop.className = "backdrop hidden";
    this.backdrop.addEventListener("click", (e) => {
      if (e.target === this.backdrop) this.closeModal();
    });
    this.shadow.appendChild(this.backdrop);

    document.documentElement.appendChild(this.host);
    document.addEventListener("keydown", this.escHandler);

    this.startPositioning();
  }

  private escHandler = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && !this.backdrop.classList.contains("hidden")) {
      this.closeModal();
    }
  };

  private startPositioning(): void {
    const anchor: { getBoundingClientRect: () => DOMRect } = {
      getBoundingClientRect: () => this.editor.getBoundingClientRect(),
    };
    this.autoCleanup = autoUpdate(anchor as Element, this.btn, () => {
      void computePosition(anchor as Element, this.btn, {
        placement: "top-end",
        middleware: [offset(8), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        this.btn.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      });
    });
  }

  private openModal(): void {
    if (this.destroyed) return;
    this.drafts = [];
    this.error = null;
    this.loading = true;
    this.renderModal();
    this.backdrop.classList.remove("hidden");
    void this.fetchDrafts();
  }

  private renderModal(): void {
    this.backdrop.replaceChildren();
    const modal = document.createElement("div");
    modal.className = "modal";

    const head = document.createElement("div");
    head.className = "head";
    const h2 = document.createElement("h2");
    h2.textContent = "Suggested replies";
    head.appendChild(h2);
    const close = document.createElement("button");
    close.className = "close";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.addEventListener("click", () => this.closeModal());
    head.appendChild(close);
    modal.appendChild(head);

    const body = document.createElement("div");
    body.className = "body";

    if (this.loading) {
      const s = document.createElement("div");
      s.className = "state";
      s.textContent = "Reading the thread and drafting 3 replies...";
      body.appendChild(s);
    } else if (this.error) {
      const s = document.createElement("div");
      s.className = "state error";
      s.textContent = this.error;
      body.appendChild(s);
    } else if (this.drafts.length === 0) {
      const s = document.createElement("div");
      s.className = "state";
      s.textContent = "No drafts returned.";
      body.appendChild(s);
    } else {
      const list = document.createElement("div");
      list.className = "drafts";
      for (const d of this.drafts) {
        const card = document.createElement("div");
        card.className = "draft";
        card.addEventListener("click", () => this.applyDraft(d));
        const label = document.createElement("div");
        label.className = "label";
        label.textContent = d.label;
        card.appendChild(label);
        const txt = document.createElement("div");
        txt.className = "body-text";
        txt.textContent = d.body;
        card.appendChild(txt);
        const hint = document.createElement("div");
        hint.className = "hint";
        hint.textContent = "Click to insert into reply";
        card.appendChild(hint);
        list.appendChild(card);
      }
      body.appendChild(list);
    }
    modal.appendChild(body);

    const foot = document.createElement("div");
    foot.className = "foot";
    const cancel = document.createElement("button");
    cancel.className = "action";
    cancel.textContent = "Close";
    cancel.addEventListener("click", () => this.closeModal());
    foot.appendChild(cancel);
    modal.appendChild(foot);

    this.backdrop.appendChild(modal);
  }

  private async fetchDrafts(): Promise<void> {
    const myId = ++this.requestId;
    const thread = extractMessages(this.conversation, MAX_MESSAGES);
    if (thread.length === 0) {
      this.error = "Couldn't read the email thread from this view.";
      this.loading = false;
      this.renderModal();
      return;
    }
    try {
      const res = (await chrome.runtime.sendMessage({
        kind: "reply_drafts",
        thread,
        userName: getCurrentUserName(),
      } as BackgroundMessage)) as BackgroundResponse<{
        drafts: ReplyDraft[];
      }>;
      if (myId !== this.requestId) return;
      if (res.ok && res.data) {
        this.drafts = res.data.drafts;
      } else {
        this.error = res.error ?? "Unknown error";
      }
    } catch (e) {
      if (myId !== this.requestId) return;
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.loading = false;
    if (!this.backdrop.classList.contains("hidden")) this.renderModal();
  }

  private applyDraft(draft: ReplyDraft): void {
    if (!this.editor.isConnected) {
      this.closeModal();
      return;
    }
    this.editor.focus();
    const sel = window.getSelection();
    if (!sel) return;

    // Select all existing content in the editor (we replace, not append, so
    // a previously-inserted draft is overwritten cleanly).
    const all = document.createRange();
    all.selectNodeContents(this.editor);
    sel.removeAllRanges();
    sel.addRange(all);

    const ok = document.execCommand("insertText", false, draft.body);
    if (!ok) {
      this.editor.textContent = draft.body;
    }
    this.closeModal();
  }

  private closeModal(): void {
    this.backdrop.classList.add("hidden");
    this.requestId++;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.autoCleanup) this.autoCleanup();
    document.removeEventListener("keydown", this.escHandler);
    this.host.remove();
  }
}

// Walks up from the editor, looking for an ancestor that contains
// [data-message-id] descendants OUTSIDE the editor itself. That's the
// conversation container. Returns null for new-compose dialogs.
export function findReplyConversation(editor: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = editor.parentElement;
  while (node && node !== document.body) {
    const messages = node.querySelectorAll("[data-message-id]");
    let hasMessageOutsideEditor = false;
    for (const m of Array.from(messages)) {
      if (!editor.contains(m)) {
        hasMessageOutsideEditor = true;
        break;
      }
    }
    if (hasMessageOutsideEditor) return node;
    node = node.parentElement;
  }
  return null;
}

function extractMessages(
  conversation: HTMLElement,
  max: number,
): { from: string; body: string }[] {
  const nodes = Array.from(
    conversation.querySelectorAll<HTMLElement>("[data-message-id]"),
  );
  const lastN = nodes.slice(-max);
  return lastN
    .map((m) => ({ from: extractSender(m), body: extractBody(m) }))
    .filter((m) => m.body.length > 0);
}

function extractSender(messageEl: HTMLElement): string {
  // Gmail attaches the sender's email/name to a span with an `email` attr.
  const span = messageEl.querySelector<HTMLElement>("[email]");
  if (span) {
    const name = span.getAttribute("name");
    if (name && name.trim()) return name.trim();
    const email = span.getAttribute("email");
    if (email && email.trim()) return email.trim();
  }
  return "unknown";
}

function extractBody(messageEl: HTMLElement): string {
  let bodyEl: Element | null = messageEl.querySelector("div.a3s");
  if (!bodyEl) bodyEl = messageEl.querySelector('div[role="document"]');
  if (!bodyEl) bodyEl = messageEl;
  const clone = bodyEl.cloneNode(true) as Element;
  clone
    .querySelectorAll(".gmail_quote, blockquote, .gmail_signature")
    .forEach((el) => el.remove());
  return (clone.textContent ?? "").trim().slice(0, 4000);
}

function getCurrentUserName(): string | undefined {
  const widget = document.querySelector('a[aria-label*="Google Account"]');
  const label = widget?.getAttribute("aria-label");
  if (!label) return undefined;
  // Common patterns: "Google Account: Ziv Raviv (...)", "Google-Konto: ..."
  const m = label.match(/[:.]\s+([^()]+?)\s*\(/);
  if (m) return m[1].trim();
  return undefined;
}
