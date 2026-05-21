/**
 * useTTS — Text-to-Speech hook backed by POST /api/voice/speak.
 *
 * Usage
 * -----
 * ```tsx
 * const { speak, stop, isSpeaking } = useTTS(authToken);
 *
 * // Read a message aloud
 * speak("The quick brown fox jumps over the lazy dog.");
 *
 * // Cancel mid-playback
 * stop();
 * ```
 *
 * Design
 * ------
 * - Fetches WAV bytes from the backend, creates a blob URL, plays via
 *   the browser's Audio API.  No third-party library needed.
 * - Queuing: if `speak()` is called while already speaking, the current
 *   audio is stopped and the new text starts immediately.
 * - The hook is safe to call in SSR contexts (checks for `window`).
 */

import { useRef, useState, useCallback } from "react";
import { API_VOICE } from "@/config";

export interface UseTTSReturn {
  speak:     (text: string, voice?: string) => Promise<void>;
  stop:      () => void;
  isSpeaking: boolean;
}

export default function useTTS(authToken: string): UseTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef  = useRef<string | null>(null);

  /** Release the current blob URL to free memory. */
  const _cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    _cleanup();
  }, [_cleanup]);

  const speak = useCallback(async (text: string, voice = "bm_lewis"): Promise<void> => {
    // Cancel anything already playing
    _cleanup();

    if (!text.trim()) return;

    try {
      const res = await fetch(`${API_VOICE}/speak`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ text, voice }),
      });

      if (!res.ok) {
        console.warn("[useTTS] /speak returned", res.status);
        return;
      }

      const wavBytes  = await res.arrayBuffer();
      const blob      = new Blob([wavBytes], { type: "audio/wav" });
      const blobUrl   = URL.createObjectURL(blob);
      blobUrlRef.current = blobUrl;

      const audio = new Audio(blobUrl);
      audioRef.current = audio;

      setIsSpeaking(true);

      // Await full playback — callers can chain logic after audio ends.
      await new Promise<void>((resolve) => {
        audio.onended = () => { _cleanup(); resolve(); };
        audio.onerror = () => { _cleanup(); resolve(); };
        audio.play().catch(() => { _cleanup(); resolve(); });
      });
    } catch (err) {
      console.warn("[useTTS] speak error:", err);
      _cleanup();
    }
  }, [authToken, _cleanup]);

  return { speak, stop, isSpeaking };
}
