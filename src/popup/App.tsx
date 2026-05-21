import { useEffect, useState } from "react";
import type {
  BackgroundResponse,
  ExtensionSettings,
  ModelId,
  TabMessage,
  TabResponse,
  UsageStats,
} from "@/shared/types";

const MODEL_PRICING_USD_PER_MTOK: Record<
  ModelId,
  { input: number; output: number; cache_read: number }
> = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cache_read: 0.1 },
  "claude-sonnet-4-6": { input: 3, output: 15, cache_read: 0.3 },
  "claude-opus-4-7": { input: 15, output: 75, cache_read: 1.5 },
};

const MIN_GRADE = 2;
const MAX_GRADE = 14;

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"scan" | "fix" | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [gradeSaving, setGradeSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [s, u] = await Promise.all([
        chrome.runtime.sendMessage({ kind: "get_settings" }) as Promise<
          BackgroundResponse<ExtensionSettings>
        >,
        chrome.runtime.sendMessage({ kind: "get_usage" }) as Promise<
          BackgroundResponse<UsageStats | null>
        >,
      ]);
      if (s.ok && s.data) setSettings(s.data);
      if (u.ok) setUsage(u.data ?? null);
      setLoading(false);
    })();
  }, []);

  async function sendToTab(msg: TabMessage): Promise<TabResponse> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return { ok: false, error: "No active tab" };
    }
    // The popup can only message content scripts injected into supported pages
    // (mail.google.com and www.facebook.com per manifest). Other tabs return
    // "Could not establish connection" - surface that as a user-friendly hint.
    try {
      return (await chrome.tabs.sendMessage(tab.id, msg)) as TabResponse;
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      if (m.includes("Could not establish connection")) {
        return {
          ok: false,
          error: "Open Gmail or Facebook in the active tab first.",
        };
      }
      return { ok: false, error: m };
    }
  }

  /** Refresh = scan only. Runs the suggestion check now, skipping debounce.
   *  The user can then hover the wavy underlines that appear in the composer
   *  and accept them one by one. Does NOT apply anything. */
  async function onScan() {
    setBusy("scan");
    setStatus(null);
    const res = await sendToTab({ kind: "fix_now" });
    setStatus({ ok: res.ok, text: res.status ?? res.error ?? "Done." });
    setBusy(null);
  }

  /** Fix all = scan + apply every suggestion the scan surfaced, in one
   *  click. Two-step under the hood so the result count is accurate even
   *  when the scan finds nothing. */
  async function onFixAll() {
    setBusy("fix");
    setStatus(null);
    const checkRes = await sendToTab({ kind: "fix_now" });
    if (!checkRes.ok) {
      setStatus({ ok: false, text: checkRes.status ?? checkRes.error ?? "Failed." });
      setBusy(null);
      return;
    }
    if ((checkRes.count ?? 0) === 0) {
      setStatus({ ok: true, text: "Draft is clean. No fixes needed." });
      setBusy(null);
      return;
    }
    const applyRes = await sendToTab({ kind: "accept_all" });
    if (!applyRes.ok) {
      setStatus({
        ok: false,
        text: `Scanned and found ${checkRes.count} issue${checkRes.count === 1 ? "" : "s"} but could not apply: ${applyRes.error ?? "unknown"}`,
      });
    } else {
      const applied = applyRes.count ?? 0;
      setStatus({
        ok: true,
        text: `Fixed ${applied} issue${applied === 1 ? "" : "s"} in your draft.`,
      });
    }
    setBusy(null);
  }

  async function onGradeChange(newGrade: number) {
    if (!settings) return;
    const clamped = Math.max(MIN_GRADE, Math.min(MAX_GRADE, Math.round(newGrade)));
    setSettings({ ...settings, targetGrade: clamped });
    setGradeSaving(true);
    const res = (await chrome.runtime.sendMessage({
      kind: "set_settings",
      settings: { targetGrade: clamped },
    })) as BackgroundResponse<ExtensionSettings>;
    if (res.ok && res.data) setSettings(res.data);
    setGradeSaving(false);
  }

  if (loading) {
    return (
      <div className="wrap">
        <h1>Loading...</h1>
      </div>
    );
  }

  const keyMissing = !settings?.apiKey;
  const todayCost = usage ? estimateCost(usage, settings!.model) : 0;
  const monthlyProjection = todayCost * 30;
  const grade = settings?.targetGrade ?? 8;
  const voiceLoaded = (settings?.voiceProfile ?? "").trim().length > 0;

  return (
    <div className="wrap">
      <h1>Proofreading Chrome Buddy</h1>

      <div>
        {keyMissing ? (
          <span className="status-pill warn">API key missing</span>
        ) : (
          <span className="status-pill ok">Active</span>
        )}
        {voiceLoaded && (
          <span className="status-pill ok" style={{ marginLeft: 6 }}>
            Voice loaded
          </span>
        )}
      </div>

      <div className="card">
        <div className="label">Actions on the current draft</div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button
            type="button"
            className="btn ghost"
            style={{
              width: 40,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
            disabled={busy !== null || keyMissing}
            onClick={onScan}
            title="Scan now: find all issues in the current draft (does not apply anything)"
            aria-label="Scan for issues"
          >
            {busy === "scan" ? (
              <span style={{ fontSize: 11 }}>...</span>
            ) : (
              // Two-arrow "sync" refresh - one arc on top going clockwise,
              // one arc on bottom going clockwise, each with its own chevron.
              // Cleaner than a single 3/4-circle arrow whose head sits next
              // to the path's start point.
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <polyline points="21 3 21 8 16 8" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                <polyline points="3 21 3 16 8 16" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="btn"
            style={{ flex: 1 }}
            disabled={busy !== null || keyMissing}
            onClick={onFixAll}
            title="Scan the current draft and apply every suggestion in one click"
          >
            {busy === "fix" ? "Fixing..." : "Fix all"}
          </button>
        </div>
        {status && (
          <div
            className="sub"
            style={{ marginTop: 8, color: status.ok ? "#0a7f3f" : "#a23030" }}
          >
            {status.text}
          </div>
        )}
      </div>

      <div className="card">
        <div className="label">
          Hemingway grade target
          <span style={{ float: "right", color: "#444", fontWeight: 600 }}>
            Grade {grade}
            {gradeSaving && (
              <span className="muted" style={{ marginLeft: 6 }}>
                saving...
              </span>
            )}
          </span>
        </div>
        <input
          type="range"
          min={MIN_GRADE}
          max={MAX_GRADE}
          step={1}
          value={grade}
          onChange={(e) => onGradeChange(Number(e.target.value))}
          style={{ width: "100%", marginTop: 6 }}
          aria-label="Hemingway target reading grade"
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: "#777",
            marginTop: -2,
          }}
        >
          <span>2 (early reader)</span>
          <span>8 (default)</span>
          <span>14 (college)</span>
        </div>
        <div className="sub" style={{ marginTop: 6 }}>
          Suggestions and rewrites will target this reading level.
        </div>
      </div>

      {usage ? (
        <>
          <div className="card">
            <div className="label">Today ({usage.date})</div>
            <div className="value cost">${todayCost.toFixed(4)}</div>
            <div className="sub">
              {usage.calls} call{usage.calls === 1 ? "" : "s"} ·{" "}
              {usage.input_tokens.toLocaleString()} in ·{" "}
              {usage.output_tokens.toLocaleString()} out
              {usage.cache_read_tokens > 0 && (
                <> · {usage.cache_read_tokens.toLocaleString()} cached</>
              )}
            </div>
          </div>
          <div className="card">
            <div className="label">Projected monthly</div>
            <div className="value cost">${monthlyProjection.toFixed(2)}</div>
            <div className="sub">at today's pace × 30 days</div>
          </div>
        </>
      ) : (
        <div className="card">
          <div className="label">Usage</div>
          <div className="sub">No API calls yet today.</div>
        </div>
      )}

      <button
        type="button"
        className="btn"
        onClick={() => {
          // MV3 canonical API for opening the options page. Honors the manifest
          // `options_ui.open_in_tab` flag, focuses an already-open tab if one
          // exists, and works correctly even when the popup is opened from
          // chrome://extensions (where raw chrome-extension://... links can be
          // blocked). Falls back to chrome.tabs.create for ancient Chrome
          // versions that somehow lack openOptionsPage.
          if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
          } else {
            void chrome.tabs.create({
              url: chrome.runtime.getURL("src/options/index.html"),
            });
          }
          window.close();
        }}
      >
        Open settings
      </button>

      <p className="muted">
        Model: {modelLabel(settings!.model)}. BYOK - your key never leaves this
        browser.
      </p>
    </div>
  );
}

function estimateCost(usage: UsageStats, model: ModelId): number {
  const p = MODEL_PRICING_USD_PER_MTOK[model];
  const billableInput = Math.max(
    0,
    usage.input_tokens - usage.cache_read_tokens,
  );
  const inputCost = (billableInput / 1_000_000) * p.input;
  const cacheReadCost = (usage.cache_read_tokens / 1_000_000) * p.cache_read;
  const outputCost = (usage.output_tokens / 1_000_000) * p.output;
  return inputCost + cacheReadCost + outputCost;
}

function modelLabel(m: ModelId): string {
  switch (m) {
    case "claude-haiku-4-5-20251001":
      return "Haiku 4.5";
    case "claude-sonnet-4-6":
      return "Sonnet 4.6";
    case "claude-opus-4-7":
      return "Opus 4.7";
  }
}
