/**
 * notify.ts — Thin wrapper around the Tauri notification plugin.
 *
 * In a browser / non-Tauri context this silently no-ops so the app remains
 * runnable in a plain web dev server.
 *
 * Usage:
 *   import { notifyDesktop } from "@/utils/notify";
 *   notifyDesktop("Time for a break!", "Your 25-minute focus session has ended.");
 */

/** Returns true when the frontend is running inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Send a native desktop notification.
 *
 * Silently skips when:
 *  - Not running inside a Tauri process (browser dev mode).
 *  - The user has denied notification permission.
 *
 * @param title - Notification headline.
 * @param body  - Optional detail text shown below the title.
 */
export async function notifyDesktop(title: string, body?: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import("@tauri-apps/plugin-notification");

    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (!granted) return;

    sendNotification({ title, body: body ?? "" });
  } catch {
    // Graceful fallback — plugin may not be initialised in every environment.
  }
}
