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

const MIN_GRADE = 4;
const MAX_GRADE = 14;

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"fix" | "accept" | null>(null);
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

  async function onFixNow() {
    setBusy("fix");
    setStatus(null);
    const res = await sendToTab({ kind: "fix_now" });
    setStatus({ ok: res.ok, text: res.status ?? res.error ?? "Done." });
    setBusy(null);
  }

  async function onAcceptAll() {
    setBusy("accept");
    setStatus(null);
    const res = await sendToTab({ kind: "accept_all" });
    setStatus({ ok: res.ok, text: res.status ?? res.error ?? "Done." });
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
            className="btn"
            style={{ flex: 1 }}
            disabled={busy !== null || keyMissing}
            onClick={onFixNow}
            title="Run suggestions on the current draft now (skip the typing-pause debounce)"
          >
            {busy === "fix" ? "Checking..." : "Fix"}
          </button>
          <button
            type="button"
            className="btn"
            style={{ flex: 1 }}
            disabled={busy !== null || keyMissing}
            onClick={onAcceptAll}
            title="Accept every suggestion currently shown in the draft"
          >
            {busy === "accept" ? "Applying..." : "Accept all"}
          </button>
        </div>
        {status && (
          <div
            className={status.ok ? "sub" : "sub"}
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
          <span>4 (elementary)</span>
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

      <a
        className="btn"
        href={chrome.runtime.getURL("src/options/index.html")}
        target="_blank"
        rel="noreferrer"
      >
        Open settings
      </a>

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
