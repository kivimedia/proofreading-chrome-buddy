# Proofreading Chrome Buddy

A Grammarly-like Chrome extension for **Gmail and Facebook**, powered by
Claude (Haiku 4.5 by default). Bring-your-own-key (BYOK): your Anthropic
API key is stored in `chrome.storage.local` on your device and only ever
sent to `api.anthropic.com` directly from the extension's service worker.
No backend, no telemetry, no third party.

**Status: Phases 1-7 complete.** All planned features are live: live
suggestions with popover + Accept/Dismiss in Gmail compose and Facebook
post/comment composers, paragraph rewrite, reply drafts (Gmail only),
voice samples, custom instructions, and an ignore-word list.

Plan + roadmap: `C:\Users\raviv\.claude\plans\lets-focus-on-email-kind-rocket.md`
Phase 7 scope: `C:\Users\raviv\.claude\plans\rename-and-phase-7-fb.md`

## Features

- **Live grammar/spelling/clarity check** while you write.
  - In **Gmail compose** (new emails + replies + forwards)
  - In **Facebook composers** (feed posts, comments, replies to comments,
    group posts, marketplace descriptions)
  - Wavy-underline overlay (red for spelling/grammar, blue for
    clarity/conciseness, amber for tone)
  - Hover for a popover with the suggested fix, explanation, and
    Accept / Dismiss buttons
- **"Always ignore" link** in spelling popovers for single words: adds the
  word to your global list so it's never flagged again on any surface
- **Selection rewrite**: select text in any supported composer, the
  floating "Rewrite" pill appears, click it for a modal with 4 preset
  chips (Default / Concise / Friendlier / More formal)
- **Reply drafts** (Gmail only): when a reply compose is open, a
  "Suggest replies" pill appears with 3 drafts (Formal / Friendly /
  Brief). Click one to drop it into the reply editor
- **Your voice**: paste 2-3 of your sent messages in Settings -> Claude
  matches your tone for rewrites and reply drafts
- **Custom instructions**: free-text style guide applied to all surfaces
- **Cost tracking**: extension popup shows today's input/output/cache
  tokens and projects a monthly cost at today's pace

## Running cost

Heavy personal use targets ~**$2-3/month** at Claude Haiku 4.5 prices,
achieved with prompt caching and paragraph-level diffing (unchanged
paragraphs are not re-billed). Adding Facebook to the mix adds maybe
$0.50-$1/month for a typical user since FB posts are short.

## Privacy

Zero servers. Zero telemetry. The only network destination is
`api.anthropic.com`. Full detail in [PRIVACY.md](./PRIVACY.md).

## Setup

```bash
cd E:/FromC/projects/proofreading-chrome-buddy
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
7. Optionally paste a few of your past messages into "Voice samples" to
   give Claude a sense of your writing style.

## Dev workflow

```bash
npm run dev   # vite + CRXJS, HMR
```

Then `chrome://extensions` -> Load unpacked -> `dist/`.

## End-to-end verification

### Gmail
1. Compose a new email and type:
   `i recieved you're email yesterday and wanted to folow up.`
   Wait ~1.5s -> expect 3 red wavy underlines.
2. Hover "recieved" -> popover -> click **Accept** -> Ctrl-Z reverts.
3. Select a wordy sentence -> blue **Rewrite** pill -> modal -> click
   **Concise** -> Apply replaces in place.
4. Open an incoming email -> click Reply -> **Suggest replies** pill
   appears top-right -> click -> 3 drafts -> click one -> drops in.

### Facebook
1. Open https://www.facebook.com
2. Click "What's on your mind, Ziv?" -> type
   `this is a recieved test with you're errors`
3. Wait ~1.5s -> wavy underlines on misspellings.
4. Hover -> popover -> Accept replaces in place.
5. Select a phrase -> Rewrite pill -> modal -> Apply replaces.
6. On someone's post, click "Comment" -> same grammar check works in
   the comment box.

## Architecture

```
src/
  background/
    service-worker.ts        Message router, key custody, prompt assembly
    anthropic-client.ts      fetch wrapper + cache_control + retries
  content/
    gmail-compose-detector.ts     mail.google.com - finds compose editors
    facebook-composer-detector.ts facebook.com - finds Lexical composers
    compose-instance.ts           Per-editor (Gmail OR FB): debounce + diff
    paragraph-differ.ts           PlatformConfig + snapshot + hash + diff
    range-finder.ts               paragraph + [start,end) -> DOM Range
    overlay-renderer.ts           Shadow-DOM SVG underlines + popover
    rewrite-controller.ts         Selection-triggered Rewrite pill + modal
    reply-assist.ts               Gmail-only Suggest replies + 3-draft modal
    text-insert.ts                execCommand -> InputEvent -> DOM fallback
  options/                   React settings UI
  popup/                     React popup
  shared/
    types.ts                 Suggestion, Paragraph, ExtensionSettings, ...
    prompts.ts               Cached base prompts + Anthropic tool schemas
```

## Platform handling

`PlatformConfig` in [paragraph-differ.ts](src/content/paragraph-differ.ts)
captures the per-platform differences:

| Field             | Gmail                                          | Facebook |
|-------------------|------------------------------------------------|----------|
| blockStrategy     | "children" (each block child is a paragraph)   | "single" (whole editor is one paragraph; Lexical re-renders too aggressively to track block identity) |
| excludeSelector   | `.gmail_quote, blockquote, .gmail_signature`   | (none)   |
| enableReplyAssist | true                                           | false    |

The text-insert helper in [text-insert.ts](src/content/text-insert.ts)
tries `execCommand('insertText')` (works in Gmail), then a synthetic
`beforeinput` event with `inputType: 'insertReplacementText'` (works in
Lexical / Facebook), then direct DOM mutation as a last resort.

## BYOK + security

- Key lives in `chrome.storage.local` (not `chrome.storage.sync` - that
  syncs across devices via your Google account, which we don't want for
  an API key).
- Only the service worker reads the key. Content scripts message the
  worker via `chrome.runtime.sendMessage`; the key never enters page
  context, so a compromised webpage can't read it.
- Calls go direct to `api.anthropic.com` from the service worker (CORS
  allowed with `anthropic-dangerous-direct-browser-access: true`).
- `.gitignore` blocks `*.apikey`, `.env*`, `secrets.json`.

## Phases shipped

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
- **Phase 7**: Facebook support (post/comment composers via Lexical),
  PlatformConfig abstraction, text-insert fallback chain for editors
  that don't honour execCommand. Project rename from gmail-claude-assistant
  to proofreading-chrome-buddy.

## Future ideas (not implemented)

- Streaming for the rewrite modal (chunks appear as Claude generates).
- Per-paragraph cache that survives a page reload (sessionStorage).
- Chrome Web Store listing with proper icon and screenshots.
- Multi-language UI for the options page (currently English only).
- Google Docs support (canvas rendering needs a side-panel approach).
- Messenger.com (separate domain, separate adapter).
- LinkedIn, Twitter/X, Reddit.

## License

MIT.
