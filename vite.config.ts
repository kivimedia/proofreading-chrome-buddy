import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import manifest from "./manifest.json" with { type: "json" };

/**
 * Read an optional voice bootstrap JSON from outside the repo. The file is
 * NEVER tracked - it lives in $HOME/private/ (or wherever PB_BOOTSTRAP_VOICE
 * points). Build embeds the JSON as a `__BOOTSTRAP_VOICE__` global the
 * service worker reads on first install to seed chrome.storage.local.
 * Other contributors (no private file) get a `null` and the bootstrap path
 * is a no-op.
 */
function readBootstrapVoice(): unknown {
  const candidates = [
    process.env.PB_BOOTSTRAP_VOICE,
    path.join(os.homedir(), "private", "proofreading-buddy-bootstrap.json"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const parsed = JSON.parse(raw);
        console.log(
          `[vite] bootstrap voice loaded from ${p} ` +
            `(voiceProfile=${(parsed.voiceProfile ?? "").length} chars, ` +
            `customInstructions=${(parsed.customInstructions ?? "").length} chars, ` +
            `ignoreWords=${(parsed.ignoreWords ?? []).length} entries)`,
        );
        return parsed;
      }
    } catch (e) {
      console.warn(`[vite] failed to load bootstrap voice from ${p}:`, e);
    }
  }
  console.log("[vite] no bootstrap voice file found - extension ships without seed");
  return null;
}

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  define: {
    __BOOTSTRAP_VOICE__: JSON.stringify(readBootstrapVoice()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
    sourcemap: true,
    rollupOptions: {
      input: {
        options: "src/options/index.html",
        popup: "src/popup/index.html",
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5174 },
  },
});
