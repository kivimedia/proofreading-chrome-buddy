import { useEffect, useMemo, useState } from "react";
import {
  buildSystemPrompt,
  type Surface,
} from "@/shared/build-system-prompt";
import {
  REPLY_SYSTEM_PROMPT,
  REWRITE_SYSTEM_PROMPT,
  SUGGEST_SYSTEM_PROMPT,
} from "@/shared/prompts";
import type {
  BackgroundMessage,
  BackgroundResponse,
  ExtensionSettings,
  ModelId,
} from "@/shared/types";

const BASE_PROMPTS: Record<Surface, string> = {
  suggest: SUGGEST_SYSTEM_PROMPT,
  rewrite: REWRITE_SYSTEM_PROMPT,
  reply: REPLY_SYSTEM_PROMPT,
};

const SURFACE_LABEL: Record<Surface, string> = {
  suggest: "Suggest (wavy underlines)",
  rewrite: "Rewrite (selection rewrites)",
  reply: "Reply drafts",
};

type Status =
  | { kind: "idle" }
  | { kind: "pending"; msg: string }
  | { kind: "ok"; msg: string }
  | { kind: "err"; msg: string };

function send<T = unknown>(
  msg: BackgroundMessage,
): Promise<BackgroundResponse<T>> {
  return chrome.runtime.sendMessage(msg);
}

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [saveStatus, setSaveStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    send<ExtensionSettings>({ kind: "get_settings" }).then((res) => {
      if (res.ok && res.data) {
        setSettings(res.data);
        setApiKeyInput(res.data.apiKey);
      }
    });
  }, []);

  if (!settings) {
    return (
      <div className="wrap">
        <h1>Loading...</h1>
      </div>
    );
  }

  async function save(patch: Partial<ExtensionSettings>) {
    setSaveStatus({ kind: "pending", msg: "Saving..." });
    const res = await send<ExtensionSettings>({
      kind: "set_settings",
      settings: patch,
    });
    if (res.ok && res.data) {
      setSettings(res.data);
      setSaveStatus({ kind: "ok", msg: "Saved" });
      setTimeout(() => setSaveStatus({ kind: "idle" }), 1500);
    } else {
      setSaveStatus({ kind: "err", msg: res.error ?? "Save failed" });
    }
  }

  async function testKey() {
    setStatus({ kind: "pending", msg: "Pinging Anthropic..." });
    if (apiKeyInput !== settings!.apiKey) {
      await save({ apiKey: apiKeyInput });
    }
    const res = await send<{ model: string }>({
      kind: "ping",
      apiKey: apiKeyInput,
      model: settings!.model,
    });
    if (res.ok && res.data) {
      setStatus({
        kind: "ok",
        msg: `Connected. Model echo: ${res.data.model}`,
      });
    } else {
      setStatus({ kind: "err", msg: res.error ?? "Unknown error" });
    }
  }

  return (
    <div className="wrap">
      <h1>Proofreading Chrome Buddy</h1>
      <p className="subtitle">
        Live writing suggestions, rewrite, and reply drafts in Gmail and
        Facebook. Your API key never leaves this browser.
      </p>

      <div className="section">
        <h2>Anthropic API Key</h2>
        <label htmlFor="key">API key (sk-ant-...)</label>
        <div className="row">
          <input
            id="key"
            type="password"
            value={apiKeyInput}
            placeholder="sk-ant-api03-..."
            onChange={(e) => setApiKeyInput(e.target.value)}
            autoComplete="off"
          />
          <button onClick={testKey} disabled={!apiKeyInput}>
            Test key
          </button>
        </div>
        <p className="help">
          Get a key at console.anthropic.com -&gt; Settings -&gt; API Keys.
          Stored in chrome.storage.local on this device only.
        </p>
        {status.kind === "pending" && (
          <div className="status pending">{status.msg}</div>
        )}
        {status.kind === "ok" && <div className="status ok">{status.msg}</div>}
        {status.kind === "err" && (
          <div className="status err">{status.msg}</div>
        )}
      </div>

      <div className="section">
        <h2>Model</h2>
        <label htmlFor="model">Default model</label>
        <select
          id="model"
          value={settings.model}
          onChange={(e) => save({ model: e.target.value as ModelId })}
        >
          <option value="claude-haiku-4-5-20251001">
            Claude Haiku 4.5 (fast, cheapest, recommended)
          </option>
          <option value="claude-sonnet-4-6">
            Claude Sonnet 4.6 (higher quality, ~5x cost)
          </option>
          <option value="claude-opus-4-8">
            Claude Opus 4.8 (best quality, latest, ~20x cost)
          </option>
          <option value="claude-opus-4-7">
            Claude Opus 4.7 (best quality, ~20x cost)
          </option>
        </select>
        <p className="help">
          Haiku is plenty for grammar/spelling. Switch to Sonnet for nuanced
          tone/clarity rewrites if you notice quality issues.
        </p>
      </div>

      <div className="section">
        <h2>Features</h2>
        <FeatureToggle
          label="Grammar &amp; spelling"
          desc="Underline errors as you type."
          checked={settings.features.grammarSpelling}
          onChange={(v) =>
            save({ features: { ...settings.features, grammarSpelling: v } })
          }
        />
        <FeatureToggle
          label="Clarity &amp; tone rewrites"
          desc="Suggest tightening wordy or awkward phrasing."
          checked={settings.features.clarityTone}
          onChange={(v) =>
            save({ features: { ...settings.features, clarityTone: v } })
          }
        />
        <FeatureToggle
          label="Rewrite paragraph"
          desc="Toolbar button: select text, get a rewrite."
          checked={settings.features.rewriteParagraph}
          onChange={(v) =>
            save({ features: { ...settings.features, rewriteParagraph: v } })
          }
        />
        <FeatureToggle
          label="Reply drafts"
          desc="Suggest 3 reply drafts when reading an email."
          checked={settings.features.replyDrafts}
          onChange={(v) =>
            save({ features: { ...settings.features, replyDrafts: v } })
          }
        />
      </div>

      <div className="section">
        <h2>Your Voice (Rewrite + Reply)</h2>
        <label htmlFor="voice">Voice samples</label>
        <textarea
          id="voice"
          rows={6}
          placeholder={
            "Paste 2-3 short emails you've written. Claude will match your tone, vocabulary, sentence rhythm and formality when rewriting or drafting replies. Plain text, no headers needed."
          }
          value={settings.voiceSamples}
          onChange={(e) => save({ voiceSamples: e.target.value })}
        />
        <p className="help">
          Used only for the Rewrite modal and Reply drafts (not for grammar
          checks). Empty = Claude uses its default professional tone.
        </p>

        <label htmlFor="ci" style={{ marginTop: 18 }}>
          Custom instructions
        </label>
        <textarea
          id="ci"
          rows={3}
          placeholder={
            "Examples: \"Never use emdashes.\" / \"Always sign with 'Best, Ziv'.\" / \"Don't use the word 'leverage'.\""
          }
          value={settings.customInstructions}
          onChange={(e) => save({ customInstructions: e.target.value })}
        />
        <p className="help">
          Applied to all surfaces (grammar, rewrite, reply). Keep it short -
          the more rules, the less Claude can hold in attention.
        </p>
      </div>

      <div className="section">
        <h2>Voice Profile (private)</h2>
        <p className="help">
          Paste your full writing voice / coaching ruleset here. Unlike
          &quot;Voice samples&quot; above (which only feeds Rewrite + Reply),
          this is injected into every suggestion, rewrite, and reply draft so
          the buddy thinks in your voice end-to-end. Useful when you have a
          structured coaching cassette you want to bake in. Empty = no
          additional voice instructions.
        </p>
        <p className="help" style={{ color: "#a23030", fontWeight: 600 }}>
          Stored only in this browser&apos;s chrome.storage.local. Never sent
          anywhere except to Anthropic at request time. Never committed - do
          NOT paste anything you would not put in a private file.
        </p>
        <textarea
          id="voiceProfile"
          rows={10}
          placeholder={
            "Paste a markdown / plain-text ruleset that describes how you write and coach yourself to write. The longer + more specific, the better the output matches."
          }
          value={settings.voiceProfile}
          onChange={(e) => save({ voiceProfile: e.target.value })}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
          <label
            htmlFor="voice-import"
            className="btn"
            style={{ cursor: "pointer", margin: 0 }}
          >
            Import from file...
          </label>
          <input
            id="voice-import"
            type="file"
            accept=".md,.txt,text/plain,text/markdown"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              await save({ voiceProfile: text });
              // Reset the input so the same file can be re-imported later.
              e.target.value = "";
            }}
          />
          {settings.voiceProfile && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (
                  confirm(
                    "Clear the voice profile? This only clears it in this browser; nothing is sent anywhere.",
                  )
                ) {
                  save({ voiceProfile: "" });
                }
              }}
            >
              Clear
            </button>
          )}
          <span className="help" style={{ marginLeft: "auto" }}>
            {settings.voiceProfile
              ? `${settings.voiceProfile.length.toLocaleString()} characters loaded`
              : "empty"}
          </span>
        </div>

        <label htmlFor="grade" style={{ marginTop: 18 }}>
          Target reading grade (Hemingway scale)
        </label>
        <input
          id="grade"
          type="number"
          min={2}
          max={14}
          step={1}
          value={settings.targetGrade}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) {
              save({ targetGrade: Math.max(2, Math.min(14, Math.round(n))) });
            }
          }}
          style={{ width: 80 }}
        />
        <p className="help">
          Claude will target this reading level on every suggestion + rewrite.
          2 = early reader, 8 = the Hemingway-app default, 14 = college. You
          can also adjust this from the popup slider.
        </p>
      </div>

      <div className="section">
        <RulesInEffect settings={settings} />
      </div>

      <div className="section">
        <h2>Ignore Words</h2>
        <p className="help">
          Words the grammar checker will never flag. Useful for proper nouns,
          jargon, and intentional misspellings. Click the &times; on a chip
          to remove it.
        </p>
        <IgnoreWordsEditor
          words={settings.ignoreWords}
          onChange={(words) => save({ ignoreWords: words })}
        />
      </div>

      <div className="section">
        <h2>Timing</h2>
        <label htmlFor="debounce">
          Debounce (ms after you stop typing before checking)
        </label>
        <input
          id="debounce"
          type="text"
          inputMode="numeric"
          value={settings.debounceMs}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n) && n >= 500 && n <= 10000) save({ debounceMs: n });
          }}
        />
        <p className="help">500-10000 ms. Default 1500.</p>
      </div>

      {saveStatus.kind === "ok" && (
        <div className="status ok">{saveStatus.msg}</div>
      )}
      {saveStatus.kind === "err" && (
        <div className="status err">{saveStatus.msg}</div>
      )}
    </div>
  );
}

function FeatureToggle(props: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <div>
        <div className="label">{props.label}</div>
        <div className="desc">{props.desc}</div>
      </div>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </div>
  );
}

function IgnoreWordsEditor(props: {
  words: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function add(): void {
    const w = input.trim();
    if (!w) return;
    if (props.words.some((x) => x.toLowerCase() === w.toLowerCase())) {
      setInput("");
      return;
    }
    props.onChange([...props.words, w]);
    setInput("");
  }

  function remove(idx: number): void {
    const next = props.words.slice();
    next.splice(idx, 1);
    props.onChange(next);
  }

  return (
    <>
      <div className="row">
        <input
          type="text"
          value={input}
          placeholder="e.g. kmboards, ChoirMind, Mariz"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button onClick={add} disabled={!input.trim()}>
          Add
        </button>
      </div>
      <div className="chips">
        {props.words.length === 0 ? (
          <span className="chip empty">No ignored words yet.</span>
        ) : (
          props.words.map((w, i) => (
            <span className="chip" key={`${w}-${i}`}>
              {w}
              <button onClick={() => remove(i)} aria-label={`Remove ${w}`}>
                ×
              </button>
            </span>
          ))
        )}
      </div>
    </>
  );
}

/**
 * "Rules in effect" preview - shows the EXACT composed system prompt that
 * will be sent to Claude for each of the 3 surfaces (suggest / rewrite /
 * reply), based on the current settings. Uses the same buildSystemPrompt()
 * from @/shared so there is no second source of truth + the preview cannot
 * drift from what the background actually sends.
 */
function RulesInEffect(props: { settings: ExtensionSettings }) {
  const [surface, setSurface] = useState<Surface>("suggest");

  const composed = useMemo(
    () => buildSystemPrompt(BASE_PROMPTS[surface], props.settings, surface),
    [surface, props.settings],
  );

  // Diff: how many chars/lines did OUR settings add on top of the base?
  const base = BASE_PROMPTS[surface];
  const addedChars = composed.length - base.length;
  const addedLines = composed.split("\n").length - base.split("\n").length;

  return (
    <>
      <h2>Rules in effect</h2>
      <p className="help">
        This is exactly what Claude sees as the system prompt for each surface
        on every call, given your current settings. Use this to verify your
        voice profile, custom instructions, ignore-words list, and grade
        target are wired in the way you expect. Read-only.
      </p>
      <div
        role="tablist"
        aria-label="System prompt by surface"
        style={{ display: "flex", gap: 6, marginBottom: 8 }}
      >
        {(Object.keys(BASE_PROMPTS) as Surface[]).map((s) => {
          const active = s === surface;
          return (
            <button
              key={s}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setSurface(s)}
              className={active ? "btn" : "btn ghost"}
              style={{ flex: 1, fontSize: 12 }}
            >
              {SURFACE_LABEL[s]}
            </button>
          );
        })}
      </div>
      <div
        className="help"
        style={{ marginBottom: 6, display: "flex", justifyContent: "space-between" }}
      >
        <span>
          {composed.length.toLocaleString()} chars total
          {addedChars > 0 && (
            <>
              {" "}({addedChars.toLocaleString()} added by your settings, +{addedLines} line
              {addedLines === 1 ? "" : "s"})
            </>
          )}
        </span>
        <button
          type="button"
          className="btn ghost"
          style={{ padding: "2px 8px", fontSize: 11 }}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(composed);
            } catch {
              // Some browsers block clipboard in extension pages; ignore.
            }
          }}
          title="Copy this exact prompt to the clipboard"
        >
          Copy
        </button>
      </div>
      <textarea
        readOnly
        rows={20}
        value={composed}
        style={{
          fontFamily:
            "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
          fontSize: 12,
          lineHeight: 1.45,
        }}
      />
      <p className="help">
        The base prompt for {SURFACE_LABEL[surface]} comes from
        <code style={{ marginLeft: 4 }}>src/shared/prompts.ts</code>. Anything
        below it in this preview was added because of your settings (voice
        profile, grade target, custom instructions, voice samples, ignore
        words). Edit those fields above and switch tabs - this preview
        updates live.
      </p>
    </>
  );
}
