/**
 * Listens for messages from the extension popup (`chrome.tabs.sendMessage`)
 * and dispatches them to the right ComposeInstance.
 *
 * Strategy for "which composer is the user looking at?":
 *   1. The composer whose editor contains document.activeElement (focused).
 *   2. Otherwise, the most-recently-added composer (best guess for "the one
 *      that's open"). Both Gmail and Facebook compose dialogs are typically
 *      one-at-a-time even when multiple windows exist.
 *
 * Adding both Gmail and Facebook detectors call `installPopupRouter()` with
 * their instances map so the same routing logic works on both platforms.
 */
import type { ComposeInstance } from "./compose-instance";
import type { TabMessage, TabResponse } from "@/shared/types";

let installed = false;

export function installPopupRouter(
  instances: Map<HTMLElement, ComposeInstance>,
): void {
  if (installed) return;
  installed = true;
  chrome.runtime.onMessage.addListener(
    (msg: TabMessage, _sender, sendResponse) => {
      // Only handle our two tab-targeted message kinds. Anything else (e.g.
      // background-sent messages) is ignored so we don't conflict.
      if (msg?.kind !== "fix_now" && msg?.kind !== "accept_all") return false;

      const target = pickTargetInstance(instances);
      if (!target) {
        const res: TabResponse = {
          ok: false,
          status: "No active composer found. Open a Gmail or Facebook composer first.",
        };
        sendResponse(res);
        return false;
      }

      if (msg.kind === "fix_now") {
        (async () => {
          try {
            await target.forceCheck();
            const remaining = target.pendingCount();
            const res: TabResponse = {
              ok: true,
              status:
                remaining > 0
                  ? `Found ${remaining} suggestion${remaining === 1 ? "" : "s"}.`
                  : "No issues found in the current draft.",
              count: remaining,
            };
            sendResponse(res);
          } catch (err) {
            const res: TabResponse = {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            };
            sendResponse(res);
          }
        })();
        return true; // keep channel open for async sendResponse
      }

      if (msg.kind === "accept_all") {
        try {
          const applied = target.acceptAll();
          const res: TabResponse = {
            ok: true,
            status:
              applied > 0
                ? `Applied ${applied} suggestion${applied === 1 ? "" : "s"}.`
                : "No suggestions to accept.",
            count: applied,
          };
          sendResponse(res);
        } catch (err) {
          const res: TabResponse = {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
          sendResponse(res);
        }
        return false; // sync response, channel can close
      }

      return false;
    },
  );
}

function pickTargetInstance(
  instances: Map<HTMLElement, ComposeInstance>,
): ComposeInstance | null {
  let lastFocused: ComposeInstance | null = null;
  let lastSeen: ComposeInstance | null = null;
  for (const inst of instances.values()) {
    lastSeen = inst;
    if (inst.containsActiveElement()) lastFocused = inst;
  }
  return lastFocused ?? lastSeen;
}
