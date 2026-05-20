import { useEffect, useState } from "react";
import type {
  BackgroundResponse,
  ExtensionSettings,
  ModelId,
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

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="wrap">
      <h1>Proofreading Chrome Buddy</h1>

      <div>
        {keyMissing ? (
          <span className="status-pill warn">API key missing</span>
        ) : (
          <span className="status-pill ok">Active</span>
        )}
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
                <>
                  {" "}
                  · {usage.cache_read_tokens.toLocaleString()} cached
                </>
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
  // cache_creation tokens are billed at ~1.25x input; folded into input_tokens
  // by the API already, so no extra term here.
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
