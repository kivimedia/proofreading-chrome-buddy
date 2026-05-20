# Gmail Claude Assistant

A Grammarly-like Chrome extension for Gmail, powered by Claude (Haiku 4.5 by default).
Bring-your-own-key (BYOK): your Anthropic API key is stored in `chrome.storage.local`
on your device and only ever sent to `api.anthropic.com` directly from the
extension's service worker. No backend, no telemetry, no third party.

**Status: Phase 1 (scaffold + BYOK ping).** Inline underlines in Gmail compose,
rewrite mode, and reply suggestions land in Phases 2-5.

Plan + roadmap: `C:\Users\raviv\.claude\plans\lets-focus-on-email-kind-rocket.md`

## Features (when finished)

- **Live grammar/spelling check** in Gmail compose: wavy-underline overlay, hover
  for a popover with the fix, click Accept to apply.
- **Clarity/tone rewrites** suggested alongside grammar fixes.
- **Rewrite this paragraph**: select text, hit a button, get a rewrite.
- **Reply drafts**: when reading an email, get 3 reply drafts (formal/friendly/brief).

## Running cost (target)

Heavy personal use targets ~**$2-3/month** at Haiku 4.5 prices, achieved with
prompt caching and paragraph-level diffing (unchanged paragraphs are not re-billed).
See the plan file for the math.

## Setup (Phase 1)

```bash
cd E:/FromC/projects/gmail-claude-assistant
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**, pick the `dist/` folder
4. Click the extension's icon -> **Open settings**
5. Paste an Anthropic API key (get one at https://console.anthropic.com -> Settings -> API Keys)
6. Click **Test key**. Expect "Connected. Model echo: claude-haiku-4-5-..."

## Dev workflow

```bash
npm run dev   # vite + CRXJS, HMR
```

Then `chrome://extensions -> Load unpacked -> dist/`.

## Architecture

```
src/
  background/
    service-worker.ts        Message router, key custody, Anthropic calls
    anthropic-client.ts      fetch wrapper + cache_control + retries
  content/
    gmail-compose-detector.ts  MutationObserver finds compose editors
    (Phase 2+: compose-instance, overlay-renderer, reply-suggester, ...)
  options/                   React settings page (paste key, toggles)
  popup/                     React popup (status, cost today, monthly projection)
  shared/
    types.ts                 Suggestion, Paragraph, ExtensionSettings, ...
    prompts.ts               Cached system prompts + Anthropic tool schemas
```

## BYOK + security

- Key lives in `chrome.storage.local` (not `chrome.storage.sync` - that
  syncs across devices via your Google account, which we don't want for an API
  key).
- Only the service worker reads the key. Content scripts message the worker via
  `chrome.runtime.sendMessage`; the key never enters page context, so a
  compromised webpage can't read it.
- Calls go direct to `api.anthropic.com` from the service worker (CORS-allowed
  with `anthropic-dangerous-direct-browser-access: true`).
- `.gitignore` blocks `*.apikey`, `.env*`, `secrets.json`. Never commit a real key.

## License

MIT (TBD - placeholder).
