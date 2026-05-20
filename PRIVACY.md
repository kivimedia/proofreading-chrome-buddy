# Privacy Policy - Gmail Claude Assistant

**Last updated: 2026-05-20**

Gmail Claude Assistant is a Chrome extension that uses your own Anthropic
API key to provide writing suggestions, rewrites, and reply drafts on
`mail.google.com`. This document describes exactly what data it touches
and where that data goes.

## TL;DR

- **Your API key is yours.** It is stored locally in `chrome.storage.local`
  on this device only. It is never sent anywhere except directly to
  `api.anthropic.com`, from your browser, over HTTPS.
- **No backend.** The extension has no server. There is nothing to log in
  to. The author cannot see your emails, your API key, or your usage.
- **No telemetry, no analytics, no third-party trackers.**

## What data the extension reads

When you have the extension installed and open `mail.google.com`:

1. **Email being composed**: when you type in a Gmail compose box, the
   extension reads the text of the message body (excluding quoted history,
   `<blockquote>` content, and your signature) and sends it to Anthropic's
   API to check for grammar, spelling, clarity, and tone issues.
2. **Email thread (reply context only)**: when you open a reply compose
   and click the "Suggest replies" button, the extension reads the last
   1-3 messages of the visible thread (sender name + body, with quoted
   regions stripped) and sends them to Anthropic to draft three replies.
3. **Selected text (rewrite mode only)**: when you select text in a
   compose box and click the floating "Rewrite" button, the extension
   sends that selection to Anthropic for rewriting.

The extension does NOT read:
- Incoming messages you are simply viewing (only the thread under an
  active reply compose, and only when you press the button).
- Attachments.
- Contacts, labels, folders, or any Gmail metadata.
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
https://github.com/kivimedia/gmail-claude-assistant - file an issue
there for questions or concerns.
