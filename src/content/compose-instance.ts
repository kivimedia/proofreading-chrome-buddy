import { OverlayRenderer, type OverlayItem } from "./overlay-renderer";
import {
  diffParagraphs,
  GMAIL_CONFIG,
  snapshotEditor,
  type PlatformConfig,
} from "./paragraph-differ";
import { findRangeInBlock } from "./range-finder";
import { findReplyConversation, ReplyAssist } from "./reply-assist";
import { insertTextIntoEditor } from "./text-insert";
import type {
  BackgroundMessage,
  BackgroundResponse,
  ExtensionSettings,
  Paragraph,
  Suggestion,
} from "@/shared/types";

const CACHE_CAP = 64;

export class ComposeInstance {
  private editor: HTMLElement;
  private config: PlatformConfig;
  private overlay: OverlayRenderer;
  private debounceTimer: number | null = null;
  private rafHandle: number | null = null;

  private inFlight = false;
  private rerunPending = false;

  // Suggestions cached by paragraph hash. Renders use the CURRENT editor
  // snapshot to look up by hash, so stale offsets (text edited since check)
  // are filtered out automatically.
  private suggestionsByHash = new Map<string, Suggestion[]>();
  // Suggestion keys the user has dismissed (or accepted). Survives across
  // check cycles in this composing session.
  private dismissed = new Set<string>();

  private prevParagraphs: Paragraph[] = [];
  private settings: ExtensionSettings | null = null;
  private destroyed = false;
  private replyAssist: ReplyAssist | null = null;

  private readonly inputHandler: () => void;
  private readonly viewportHandler: () => void;
  private readonly resizeObserver: ResizeObserver;

  constructor(editor: HTMLElement, config: PlatformConfig = GMAIL_CONFIG) {
    this.editor = editor;
    this.config = config;
    this.overlay = new OverlayRenderer({
      onAccept: (item) => this.handleAccept(item),
      onDismiss: (item) => this.handleDismiss(item),
      onIgnoreWord: (item) => this.handleIgnoreWord(item),
    });

    this.inputHandler = () => this.scheduleCheck();
    this.viewportHandler = () => this.scheduleRepaint();
    this.resizeObserver = new ResizeObserver(() => this.scheduleRepaint());

    this.editor.addEventListener("input", this.inputHandler);
    this.editor.addEventListener("blur", this.viewportHandler);
    window.addEventListener("scroll", this.viewportHandler, true);
    window.addEventListener("resize", this.viewportHandler);
    this.resizeObserver.observe(this.editor);

    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    const res = await sendBg<ExtensionSettings>({ kind: "get_settings" });
    if (this.destroyed) return;
    if (res.ok && res.data) {
      this.settings = res.data;
      if (this.config.enableReplyAssist && this.settings.features.replyDrafts) {
        const conv = findReplyConversation(this.editor);
        if (conv) this.replyAssist = new ReplyAssist(this.editor, conv);
      }
      this.scheduleCheck();
    }
  }

  private scheduleCheck(): void {
    if (this.destroyed) return;
    this.scheduleRepaint();
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    const ms = this.settings?.debounceMs ?? 1500;
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.runCheck();
    }, ms);
  }

  private scheduleRepaint(): void {
    if (this.destroyed) return;
    if (this.rafHandle !== null) return;
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      this.repaint();
    });
  }

  private async runCheck(): Promise<void> {
    if (this.destroyed) return;
    if (!this.settings?.apiKey) return;
    if (this.inFlight) {
      this.rerunPending = true;
      return;
    }

    const snap = snapshotEditor(this.editor, this.config);
    const changed = diffParagraphs(this.prevParagraphs, snap.paragraphs);

    if (changed.length === 0) {
      this.prevParagraphs = snap.paragraphs;
      this.repaint();
      return;
    }

    console.debug(
      "[proofreading-chrome-buddy] check dispatch:",
      changed.map((p) => `[${p.index}] ${JSON.stringify(p.text)}`).join(" | "),
    );

    this.inFlight = true;
    try {
      const res = await sendBg<{ suggestions: Suggestion[] }>({
        kind: "check",
        paragraphs: changed,
        model: this.settings.model,
      });
      if (this.destroyed) return;
      if (res.ok && res.data) {
        console.debug(
          "[proofreading-chrome-buddy] check response:",
          res.data.suggestions.length,
          "suggestion(s):",
          res.data.suggestions,
        );
        const byParaIndex = new Map<number, Suggestion[]>();
        for (const s of res.data.suggestions) {
          const arr = byParaIndex.get(s.paragraph_index) ?? [];
          arr.push(s);
          byParaIndex.set(s.paragraph_index, arr);
        }
        for (const p of changed) {
          this.suggestionsByHash.set(p.hash, byParaIndex.get(p.index) ?? []);
        }
        this.pruneCache();
      } else if (!res.ok) {
        console.warn("[proofreading-chrome-buddy] check failed:", res.error);
      }
    } catch (err) {
      console.warn("[proofreading-chrome-buddy] check threw:", err);
    } finally {
      this.inFlight = false;
      this.prevParagraphs = snap.paragraphs;
    }

    this.repaint();

    if (this.rerunPending) {
      this.rerunPending = false;
      this.scheduleCheck();
    }
  }

  private pruneCache(): void {
    if (this.suggestionsByHash.size <= CACHE_CAP) return;
    const keys = Array.from(this.suggestionsByHash.keys());
    const drop = keys.length - CACHE_CAP;
    for (let i = 0; i < drop; i++) {
      this.suggestionsByHash.delete(keys[i]);
    }
  }

  private repaint(): void {
    if (this.destroyed) return;
    if (!this.editor.isConnected) {
      this.overlay.setItems([]);
      return;
    }
    const snap = snapshotEditor(this.editor, this.config);
    const items: OverlayItem[] = [];
    for (let i = 0; i < snap.paragraphs.length; i++) {
      const para = snap.paragraphs[i];
      const block = snap.paragraphNodes[i];
      const sugs = this.suggestionsByHash.get(para.hash);
      if (!sugs?.length) continue;
      for (const s of sugs) {
        const key = suggestionKey(para.hash, s);
        if (this.dismissed.has(key)) continue;
        const range = findRangeInBlock(block, s.start, s.end);
        if (range) items.push({ suggestion: s, range, key });
      }
    }
    this.overlay.setItems(items);
  }

  private handleAccept(item: OverlayItem): void {
    if (this.destroyed) return;
    if (!this.editor.isConnected) return;
    // Build a fresh Range against the live DOM (item.range may be stale if
    // the editor rerendered since draw).
    const liveRange = this.findFreshRange(item);
    if (!liveRange) return;

    // insertTextIntoEditor tries execCommand first (Gmail), then a
    // synthetic beforeinput event (Lexical/Facebook), then direct DOM
    // mutation as a last resort.
    insertTextIntoEditor(this.editor, liveRange, item.suggestion.replacement);

    // Mark as dismissed so it doesn't re-render between now and the next check.
    this.dismissed.add(item.key);
    this.repaint();
  }

  private handleDismiss(item: OverlayItem): void {
    if (this.destroyed) return;
    this.dismissed.add(item.key);
    this.repaint();
  }

  private handleIgnoreWord(item: OverlayItem): void {
    if (this.destroyed) return;
    const word = item.suggestion.original.trim();
    // Locally drop this suggestion + any other cached suggestion targeting
    // the same word in any paragraph.
    const lower = word.toLowerCase();
    for (const [, sugs] of this.suggestionsByHash) {
      for (let i = sugs.length - 1; i >= 0; i--) {
        if (sugs[i].original.trim().toLowerCase() === lower) sugs.splice(i, 1);
      }
    }
    this.dismissed.add(item.key);
    this.repaint();
    // Persist so future checks (and other tabs) honour it.
    void sendBg({ kind: "ignore_word", word });
  }

  // Re-derive the Range against the current DOM using the same paragraph hash
  // and char offsets. Protects against the stored Range being invalidated by
  // any DOM rerender since draw.
  private findFreshRange(item: OverlayItem): Range | null {
    const snap = snapshotEditor(this.editor, this.config);
    for (let i = 0; i < snap.paragraphs.length; i++) {
      const para = snap.paragraphs[i];
      if (suggestionKey(para.hash, item.suggestion) !== item.key) continue;
      const block = snap.paragraphNodes[i];
      return findRangeInBlock(block, item.suggestion.start, item.suggestion.end);
    }
    return null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.editor.removeEventListener("input", this.inputHandler);
    this.editor.removeEventListener("blur", this.viewportHandler);
    window.removeEventListener("scroll", this.viewportHandler, true);
    window.removeEventListener("resize", this.viewportHandler);
    this.resizeObserver.disconnect();
    this.overlay.destroy();
    this.replyAssist?.destroy();
    this.replyAssist = null;
  }
}

function suggestionKey(paraHash: string, s: Suggestion): string {
  return `${paraHash}:${s.paragraph_index}:${s.start}:${s.end}:${s.replacement}`;
}

function sendBg<T = unknown>(
  msg: BackgroundMessage,
): Promise<BackgroundResponse<T>> {
  return chrome.runtime.sendMessage(msg) as Promise<BackgroundResponse<T>>;
}
