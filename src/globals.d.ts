/**
 * Vite `define` injected globals.
 *
 * `__BOOTSTRAP_VOICE__` is read by vite.config.ts from
 * `$HOME/private/proofreading-buddy-bootstrap.json` at build time (if it
 * exists) and embedded as a JS constant. The file itself is never tracked.
 * On other contributors' machines the file is absent and the value is `null`.
 */
declare const __BOOTSTRAP_VOICE__: {
  voiceProfile?: string;
  customInstructions?: string;
  ignoreWords?: string[];
} | null;
