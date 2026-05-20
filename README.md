# Gmail Claude Assistant

A Grammarly-like Chrome extension for Gmail, powered by Claude (Haiku 4.5 by default).
Bring-your-own-key (BYOK): your Anthropic API key is stored in `chrome.storage.local`
on your device and only ever sent to `api.anthropic.com` directly from the
extension's service worker. No backend, no telemetry, no third party.

**Status: Phases 1-6 complete.** All five features in the plan are live: live
suggestions with popover + Accept/Dismiss, paragraph rewrite, reply drafts,
voice samples, custom instructions, and an ignore-word list.

Plan + roadmap: `C:\Users\raviv\.claude\plans\lets-focus-on-email-kind-rocket.md`

## Features

- **Live grammar/spelling/clarity check** in Gmail compose. Wavy-underline
  overlay (red for spelling/grammar, blue for clarity/conciseness, amber for
  tone). Hover for a popover with the suggested fix, explanation, and
  Accept / Dismiss buttons. Accept uses `execCommand('insertText')` so
  Gmail's native undo stack is preserved - Ctrl-Z reverts cleanly.
- **Always-ignore words**: for spelling suggestions on single words, the
  popover has an "Always ignore" link. Adds the word to your global list so
  it's never flagged again on any email. Manage the list in Settings.
- **Paragraph rewrite**: select text in a compose body, the floating
  "Rewrite" pill appears, click it for a modal with 4 preset chips
  (Default / Concise / Friendlier / More formal). Original and rewritten
  text shown side by side, Apply replaces the selection in place.
- **Reply drafts**: when a compose is opened in reply context (Gmail
  conversation view), a "Suggest replies" pill appears at the top-right of
  the editor. Click for 3 drafts: Formal / Friendly / Brief. Click a draft
  to drop it into the reply editor.
- **Your voice (rewrite + reply only)**: paste 2-3 sample emails in
  Settings. Claude matches your tone, vocabulary, sentence rhythm, and
  level of formality for rewrites and reply drafts.
- **Custom instructions**: free-text style guide applied to all three
  surfaces (grammar, rewrite, reply). Things like "Never use emdashes",
  "Always sign with X", etc.
- **Cost tracking**: extension popup shows today's input/output/cache
  tokens and projects a monthly cost at today's pace.

## Running cost

Heavy personal use targets ~**$2-3/month** at Claude Haiku 4.5 prices,
achieved with prompt caching and paragraph-level diffing (unchanged
paragraphs are not re-billed). Switch to Sonnet 4.6 in Settings for higher
quality at ~5x the cost, or Opus 4.7 at ~20x. The popup shows your
actual projected spend daily so you can choose.

## Privacy

Zero servers. Zero telemetry. The only network destination is
`api.anthropic.com`. Full detail in [PRIVACY.md](./PRIVACY.md).

## Setup

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
7. Optionally paste 2-3 of your sent emails into "Voice samples" to give
   Claude a sense of your writing style for rewrites and replies.

## Dev workflow

```bash
npm run dev   # vite + CRXJS, HMR
```

Then `chrome://extensions` -> Load unpacked -> `dist/`.

## End-to-end verification

1. Compose a new email and type:
   `i recieved you're email yesterday and wanted to folow up with quesitons.`
   Wait ~1.5s -> expect 4 red wavy underlines.
2. Hover "recieved" -> popover shows "received" + explanation. Click
   **Accept** -> text replaces in place. Ctrl-Z reverts.
3. Hover "you're" -> click **Dismiss** -> underline disappears for the
   session.
4. Hover "folow" -> click **Always ignore "folow"** -> word added to
   your ignore list (Settings -> Ignore Words). Verify the chip appears.
5. Select a wordy sentence -> the blue **Rewrite** pill appears -> click
   it -> modal opens -> click **Concise** chip -> tighter version
   appears -> **Apply** replaces in place.
6. Open an incoming email -> click Gmail's Reply -> the **Suggest replies**
   pill appears at top-right of the reply box -> click -> 3 drafts
   appear in a modal -> click one -> drops into the reply editor.
7. Open the extension popup -> verify today's input/output tokens and
   cost projection updated.
8. Open DevTools -> Network on the service worker -> verify calls hit
   `api.anthropic.com` and the response includes `cache_read_input_tokens`
   after the second call (caching working).

## Architecture

```
src/
  background/
    service-worker.ts        Message router, key custody, prompt assembly
    anthropic-client.ts      fetch wrapper + cache_control + retries
  content/
    gmail-compose-detector.ts  MutationObserver finds compose editors
    compose-instance.ts        Per-editor: debounce + diff + suggestions
    paragraph-differ.ts        Snapshot blocks + hash + diff (skips
                               .gmail_quote, .gmail_signature, blockquote)
    range-finder.ts            paragraph + [start,end) -> DOM Range
    overlay-renderer.ts        Shadow-DOM SVG underlines + popover
                               (Accept / Dismiss / Always ignore)
    rewrite-controller.ts      Selection-triggered Rewrite pill + modal
                               (4 preset chips, in-flight cancellation)
    reply-assist.ts            Reply-context detector + Suggest replies
                               pill + 3-draft modal
  options/                   React settings (key, voice, instructions,
                             ignore list, model picker, debounce)
  popup/                     React popup (status, cost today, monthly
                             projection)
  shared/
    types.ts                 Suggestion, Paragraph, ExtensionSettings, ...
    prompts.ts               Cached base prompts + Anthropic tool schemas
```

## BYOK + security

- Key lives in `chrome.storage.local` (not `chrome.storage.sync` - that
  syncs across devices via your Google account, which we don't want for
  an API key).
- Only the service worker reads the key. Content scripts message the
  worker via `chrome.runtime.sendMessage`; the key never enters page
  context, so a compromised webpage can't read it.
- Calls go direct to `api.anthropic.com` from the service worker (CORS
  allowed with `anthropic-dangerous-direct-browser-access: true`).
- `.gitignore` blocks `*.apikey`, `.env*`, `secrets.json`. Never commit
  a real key.

## Phases that shipped

- **Phase 1**: scaffold, MV3 manifest, BYOK ping, options + popup.
- **Phase 2**: paragraph-level diffing + debounce + Shadow-DOM SVG
  wavy underlines (no interaction).
- **Phase 3**: hover popover with Accept/Dismiss, execCommand-preserving
  undo, quoted-text/signature skipping.
- **Phase 4**: selection-triggered Rewrite pill + modal with 4 preset
  chips, in-flight cancellation.
- **Phase 5**: reply-context detection + Suggest replies pill + 3-draft
  modal (formal/friendly/brief).
- **Phase 6**: voice samples + custom instructions + ignore-word list
  (popover "Always ignore" + Settings chip list), manifest hardening,
  privacy policy.

## Future ideas (not implemented)

- Streaming for the rewrite modal (chunks appear as Claude generates).
- Per-paragraph cache that survives a page reload (sessionStorage).
- Chrome Web Store listing with proper icon and screenshots.
- Multi-language UI for the options page (currently English only).
- Google Docs support (canvas rendering needs a side-panel approach).

## License

MIT.
