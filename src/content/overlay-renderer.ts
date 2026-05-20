import type { Suggestion, SuggestionCategory } from "@/shared/types";

export interface OverlayItem {
  suggestion: Suggestion;
  range: Range;
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Single document-level overlay shared by all ComposeInstance objects on the
// page. Uses Shadow DOM so Gmail's CSS can never bleed in, and a fixed
// position so we draw directly in viewport coordinates (matching what
// Range.getClientRects() returns).
export class OverlayRenderer {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private svg: SVGSVGElement;
  private items: OverlayItem[] = [];

  constructor() {
    this.host = document.createElement("div");
    this.host.setAttribute("data-gca-overlay", "");
    this.host.style.cssText =
      "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483640;";
    this.shadow = this.host.attachShadow({ mode: "open" });

    this.svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    this.svg.setAttribute(
      "style",
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;",
    );
    this.shadow.appendChild(this.svg);

    document.documentElement.appendChild(this.host);
  }

  setItems(items: OverlayItem[]): void {
    this.items = items;
    this.draw();
  }

  draw(): void {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    for (const item of this.items) {
      const rects = item.range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (rect.width < 1 || rect.height < 1) continue;
        const path = document.createElementNS(SVG_NS, "path");
        // Place the underline 1px above the baseline of the line box.
        const y = rect.bottom - 1;
        path.setAttribute("d", wavyPath(rect.left, y, rect.width));
        path.setAttribute("stroke", colorFor(item.suggestion.category));
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-linecap", "round");
        this.svg.appendChild(path);
      }
    }
  }

  destroy(): void {
    this.host.remove();
  }
}

function wavyPath(x: number, y: number, w: number): string {
  // Sinusoidal wave: wavelength 4px, peak-to-peak amplitude 3px.
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
