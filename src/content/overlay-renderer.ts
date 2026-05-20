import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
} from "@floating-ui/dom";
import type { Suggestion, SuggestionCategory } from "@/shared/types";

export interface OverlayItem {
  suggestion: Suggestion;
  range: Range;
  key: string;
}

export interface OverlayCallbacks {
  onAccept(item: OverlayItem): void;
  onDismiss(item: OverlayItem): void;
  onIgnoreWord(item: OverlayItem): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const HIDE_DELAY_MS = 200;

const SHADOW_CSS = `
:host { all: initial; }
svg.underlines, div.hits {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  pointer-events: none;
  overflow: visible;
}
div.hits div.hit {
  position: absolute;
  pointer-events: auto;
  cursor: pointer;
}
div.popover {
  position: absolute;
  top: 0; left: 0;
  max-width: 300px;
  min-width: 220px;
  background: #ffffff;
  color: #1a1f36;
  border: 1px solid #e3e8ee;
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.18);
  padding: 10px 12px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  pointer-events: auto;
  will-change: transform;
}
div.popover .head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
div.popover .pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  flex-shrink: 0;
}
div.popover .pill.cat-spelling, div.popover .pill.cat-grammar {
  background: #fdecec; color: #a82424;
}
div.popover .pill.cat-clarity, div.popover .pill.cat-conciseness {
  background: #e6efff; color: #2347a8;
}
div.popover .pill.cat-tone {
  background: #fdf3d3; color: #7a5d10;
}
div.popover .explain {
  color: #4f566b;
  font-size: 12px;
  flex: 1;
  min-width: 0;
}
div.popover .diff {
  background: #f7f8fa;
  padding: 8px 10px;
  border-radius: 5px;
  margin-bottom: 10px;
  font-size: 13px;
  word-break: break-word;
}
div.popover .diff .orig { text-decoration: line-through; color: #a82424; }
div.popover .diff .arrow { color: #697386; margin: 0 6px; }
div.popover .diff .repl { color: #0e6839; font-weight: 500; }
div.popover .actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
}
div.popover button {
  padding: 5px 12px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  font-family: inherit;
  line-height: 1;
}
div.popover button.accept {
  background: #5b6ef5; color: #ffffff; border-color: #5b6ef5;
}
div.popover button.accept:hover { background: #4554c8; }
div.popover button.dismiss {
  background: #ffffff; color: #4f566b; border-color: #cbd2dc;
}
div.popover button.dismiss:hover { background: #f1f3f6; }
div.popover button.ignore {
  background: transparent;
  color: #697386;
  border: none;
  padding: 4px 6px;
  font-size: 11px;
  margin-right: auto;
  text-decoration: underline;
  text-underline-offset: 2px;
}
div.popover button.ignore:hover { color: #1a1f36; }
`;

export class OverlayRenderer {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private svg: SVGSVGElement;
  private hitLayer: HTMLDivElement;
  private popoverEl: HTMLDivElement;
  private items: OverlayItem[] = [];
  private callbacks: OverlayCallbacks;

  private hoveredItem: OverlayItem | null = null;
  private popoverCleanup: (() => void) | null = null;
  private hideTimer: number | null = null;

  constructor(callbacks: OverlayCallbacks) {
    this.callbacks = callbacks;

    this.host = document.createElement("div");
    this.host.setAttribute("data-gca-overlay", "");
    this.host.style.cssText =
      "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483640;";
    this.shadow = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = SHADOW_CSS;
    this.shadow.appendChild(style);

    this.svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    this.svg.setAttribute("class", "underlines");
    this.shadow.appendChild(this.svg);

    this.hitLayer = document.createElement("div");
    this.hitLayer.className = "hits";
    this.shadow.appendChild(this.hitLayer);

    this.popoverEl = document.createElement("div");
    this.popoverEl.className = "popover";
    this.popoverEl.style.display = "none";
    this.popoverEl.addEventListener("mouseenter", () => this.cancelHide());
    this.popoverEl.addEventListener("mouseleave", () => this.scheduleHide());
    this.shadow.appendChild(this.popoverEl);

    document.documentElement.appendChild(this.host);
  }

  setItems(items: OverlayItem[]): void {
    this.items = items;
    this.draw();
    // If a popover is open, find the new item with the matching key and
    // update this.hoveredItem so the virtual anchor reads the FRESH Range
    // (compute-instance regenerates Ranges on every repaint). If no item
    // matches anymore, hide.
    if (this.hoveredItem) {
      const fresh = items.find((i) => i.key === this.hoveredItem!.key);
      if (fresh) {
        this.hoveredItem = fresh;
      } else {
        this.hidePopover();
      }
    }
  }

  private draw(): void {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    while (this.hitLayer.firstChild) {
      this.hitLayer.removeChild(this.hitLayer.firstChild);
    }

    for (const item of this.items) {
      const rects = item.range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (rect.width < 1 || rect.height < 1) continue;

        const path = document.createElementNS(SVG_NS, "path");
        const baselineY = rect.bottom - 1;
        path.setAttribute("d", wavyPath(rect.left, baselineY, rect.width));
        path.setAttribute("stroke", colorFor(item.suggestion.category));
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-linecap", "round");
        this.svg.appendChild(path);

        // Hit zone extends 4px past the baseline so the wavy line itself is hoverable.
        const hit = document.createElement("div");
        hit.className = "hit";
        hit.style.left = `${rect.left}px`;
        hit.style.top = `${rect.top}px`;
        hit.style.width = `${rect.width}px`;
        hit.style.height = `${rect.height + 4}px`;
        hit.addEventListener("mouseenter", () => {
          console.debug(
            "[proofreading-chrome-buddy] hit hover:",
            item.suggestion.original,
          );
          this.showPopoverFor(item, hit);
        });
        hit.addEventListener("mouseleave", () => this.scheduleHide());
        hit.addEventListener("click", () => this.showPopoverFor(item, hit));
        this.hitLayer.appendChild(hit);
      }
    }
  }

  private showPopoverFor(item: OverlayItem, anchorHit: HTMLDivElement): void {
    void anchorHit; // listened via mouseenter/click; anchor uses Range directly
    console.debug(
      "[proofreading-chrome-buddy] popover show:",
      item.suggestion.original,
      "->",
      item.suggestion.replacement,
    );
    this.cancelHide();
    const switching = this.hoveredItem?.key !== item.key;
    this.hoveredItem = item;
    if (switching) this.populatePopover(item);
    this.popoverEl.style.display = "block";

    if (this.popoverCleanup) {
      this.popoverCleanup();
      this.popoverCleanup = null;
    }

    // Virtual anchor: reads the live Range bbox each time @floating-ui
    // probes it. Survives repaints that replace the hit div, and tracks
    // text reflow without us re-registering.
    const virtualAnchor = {
      getBoundingClientRect: () => {
        const rect = item.range.getBoundingClientRect();
        // If the range collapsed (e.g. text edited out), getBoundingClientRect
        // returns a 0-size rect at 0,0. Detect and hide.
        if (rect.width === 0 && rect.height === 0) {
          queueMicrotask(() => this.hidePopover());
        }
        return rect;
      },
    };

    this.popoverCleanup = autoUpdate(
      virtualAnchor as unknown as Element,
      this.popoverEl,
      () => {
        void computePosition(
          virtualAnchor as unknown as Element,
          this.popoverEl,
          {
            placement: "bottom-start",
            middleware: [offset(6), flip(), shift({ padding: 8 })],
          },
        ).then(({ x, y }) => {
          this.popoverEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        });
      },
    );
  }

  private populatePopover(item: OverlayItem): void {
    const s = item.suggestion;
    this.popoverEl.replaceChildren();

    const head = document.createElement("div");
    head.className = "head";
    const pill = document.createElement("span");
    pill.className = `pill cat-${s.category}`;
    pill.textContent = s.category;
    head.appendChild(pill);
    const explain = document.createElement("span");
    explain.className = "explain";
    explain.textContent = s.explanation;
    head.appendChild(explain);
    this.popoverEl.appendChild(head);

    const diff = document.createElement("div");
    diff.className = "diff";
    const orig = document.createElement("span");
    orig.className = "orig";
    orig.textContent = s.original;
    diff.appendChild(orig);
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = "→";
    diff.appendChild(arrow);
    const repl = document.createElement("span");
    repl.className = "repl";
    repl.textContent = s.replacement;
    diff.appendChild(repl);
    this.popoverEl.appendChild(diff);

    const actions = document.createElement("div");
    actions.className = "actions";

    // Only show "Always ignore" for word-level spelling suggestions; for
    // grammar/clarity rewrites it doesn't make sense to ignore the phrase.
    if (s.category === "spelling" && s.original.trim().split(/\s+/).length === 1) {
      const ignore = document.createElement("button");
      ignore.className = "ignore";
      ignore.textContent = `Always ignore "${s.original.trim()}"`;
      ignore.title = "Never flag this word again on any email";
      ignore.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onIgnoreWord(item);
        this.hidePopover();
      });
      actions.appendChild(ignore);
    }

    const dismiss = document.createElement("button");
    dismiss.className = "dismiss";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks.onDismiss(item);
      this.hidePopover();
    });
    const accept = document.createElement("button");
    accept.className = "accept";
    accept.textContent = "Accept";
    accept.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks.onAccept(item);
      this.hidePopover();
    });
    actions.appendChild(dismiss);
    actions.appendChild(accept);
    this.popoverEl.appendChild(actions);
  }

  private scheduleHide(): void {
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(
      () => this.hidePopover(),
      HIDE_DELAY_MS,
    );
  }

  private cancelHide(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private hidePopover(): void {
    this.cancelHide();
    if (this.popoverCleanup) {
      this.popoverCleanup();
      this.popoverCleanup = null;
    }
    this.popoverEl.style.display = "none";
    this.hoveredItem = null;
  }

  destroy(): void {
    this.cancelHide();
    if (this.popoverCleanup) this.popoverCleanup();
    this.host.remove();
  }
}

function wavyPath(x: number, y: number, w: number): string {
  const wavelength = 4;
  const amp = 1.5;
  const steps = Math.max(1, Math.ceil(w / wavelength));
  let d = `M ${x.toFixed(2)} ${y.toFixed(2)}`;
  for (let i = 1; i <= steps; i++) {
    const cx1 = x + (i - 0.75) * wavelength;
    const cy1 = y - amp;
    const cx2 = x + (i - 0.25) * wavelength;
    const cy2 = y + amp;
    const ex = Math.min(x + i * wavelength, x + w);
    d += ` C ${cx1.toFixed(2)} ${cy1.toFixed(2)}, ${cx2.toFixed(2)} ${cy2.toFixed(2)}, ${ex.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

function colorFor(cat: SuggestionCategory): string {
  switch (cat) {
    case "spelling":
    case "grammar":
      return "#e02424";
    case "clarity":
    case "conciseness":
      return "#2563eb";
    case "tone":
      return "#ca8a04";
  }
}
