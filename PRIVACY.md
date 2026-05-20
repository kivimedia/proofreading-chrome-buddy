# Privacy Policy - Proofreading Chrome Buddy

**Last updated: 2026-05-20**

Proofreading Chrome Buddy is a Chrome extension that uses your own
Anthropic API key to provide writing suggestions, rewrites, and reply
drafts on `mail.google.com` and `www.facebook.com`. This document
describes exactly what data it touches and where that data goes.

## TL;DR

- **Your API key is yours.** It is stored locally in `chrome.storage.local`
  on this device only. It is never sent anywhere except directly to
  `api.anthropic.com`, from your browser, over HTTPS.
- **No backend.** The extension has no server. There is nothing to log in
  to. The author cannot see your emails, your API key, or your usage.
- **No telemetry, no analytics, no third-party trackers.**

## What data the extension reads

When you have the extension installed and open `mail.google.com` or
`www.facebook.com`:

1. **Drafts you are composing**: when you type into a Gmail compose box
   or a Facebook composer (feed post, comment, reply to comment, group
   post, marketplace description), the extension reads the text of that
   composer's body (in Gmail, excluding quoted history, `<blockquote>`,
   and your signature; in Facebook, the whole composer) and sends it to
   Anthropic's API to check for grammar, spelling, clarity, and tone.
2. **Email thread (Gmail reply-drafts only)**: when you open a reply
   compose in Gmail and click the "Suggest replies" button, the
   extension reads the last 1-3 messages of the visible thread (sender
   name + body, with quoted regions stripped) and sends them to
   Anthropic to draft three replies. **Facebook does not have this
   feature - no reading of other people's posts or comments.**
3. **Selected text (rewrite mode only)**: when you select text in any
   supported composer and click the floating "Rewrite" button, the
   extension sends that selection to Anthropic for rewriting.

**Important note about Facebook posts**: a post you are drafting is sent
to Anthropic for grammar-checking *before* you click Post. If you
ultimately publish the post publicly, its content is public anyway; if
you abandon the draft, the draft text has still been transmitted to
Anthropic by then. Same model as email drafts. Disable the extension on
facebook.com if this is a concern (via `chrome://extensions` -> Details
-> Site access).

The extension does NOT read:
- Incoming Gmail messages you are simply viewing (only the thread under
  an active reply compose, and only when you press the button).
- Other people's Facebook posts, comments, or any content you are
  reading rather than writing.
- Facebook DMs / Messenger (the extension is not active on
  messenger.com and does not attach to Facebook chat windows).
- Attachments, contacts, labels, folders, or any platform metadata.
- Any other page or website.

## What data the extension stores locally

In `chrome.storage.local` on this device:

- Your Anthropic API key.
- Your settings: model choice, feature toggles, debounce timing, voice
  samples, custom instructions, ignore-word list.
- Daily token-usage counters (input/output/cache tokens, per-day,
  resets at midnight UTC each day for the cost projection on the popup).

Nothing in `chrome.storage.local` is synced across devices by default
(we deliberately use `local`, not `sync`, so your API key is not copied
to Google's servers).

## What data is sent externally

The extension makes HTTPS requests **only** to `https://api.anthropic.com`,
using your API key. Each request contains:
- The text of the surface you are working on (compose body paragraphs,
  selected text, or thread messages, as described above).
- Your voice samples and custom instructions, if you have configured them.
- Your ignore-word list, in the system prompt for grammar checks.

Anthropic's API has its own privacy policy:
https://www.anthropic.com/legal/privacy

The extension does not send any data to any other domain.

## Third parties

None. The only network destination is `api.anthropic.com`. No CDN, no
analytics, no error reporting service, no auto-update server beyond the
Chrome Web Store (if you install from there).

## Removal

Uninstalling the extension via `chrome://extensions` deletes everything
stored in `chrome.storage.local`, including your API key, settings, and
usage counters. There is no remote copy to delete.

## Contact

This is a personal-use project. Source code is at
https://github.com/kivimedia/proofreading-chrome-buddy - file an issue
there for questions or concerns.
