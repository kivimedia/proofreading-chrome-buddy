import { useEffect, useState } from "react";
import type {
  BackgroundMessage,
  BackgroundResponse,
  ExtensionSettings,
  ModelId,
} from "@/shared/types";

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
