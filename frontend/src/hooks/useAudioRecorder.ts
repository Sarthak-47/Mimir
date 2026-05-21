/**
 * useAudioRecorder — thin wrapper around the browser MediaRecorder API.
 *
 * Usage
 * -----
 * ```tsx
 * const { isRecording, startRecording, stopRecording } = useAudioRecorder();
 *
 * // Start capturing mic input
 * await startRecording();
 *
 * // Stop and get the raw audio Blob (WebM/Opus)
 * const blob = await stopRecording();
 * ```
 *
 * The returned Blob can be sent directly to POST /api/voice/transcribe as
 * multipart/form-data.  PyAV on the backend handles the WebM/Opus decode.
 *
 * Error handling
 * --------------
 * - `startRecording` throws if the user denies mic permission or the
 *   MediaRecorder API is unavailable.
 * - `stopRecording` resolves to `null` if called while not recording.
 */

import { useRef, useState, useCallback } from "react";

export type RecordingState = "idle" | "recording" | "processing";

export interface UseAudioRecorderReturn {
  recordingState: RecordingState;
  isRecording:    boolean;
  startRecording: () => Promise<void>;
  stopRecording:  () => Promise<Blob | null>;
}

// Prefer WebM/Opus (browser default); fall back to whatever is supported.
const PREFERRED_MIME = "audio/webm;codecs=opus";
const mimeType = MediaRecorder.isTypeSupported(PREFERRED_MIME)
  ? PREFERRED_MIME
  : "";   // empty string = browser picks a supported format

export default function useAudioRecorder(): UseAudioRecorderReturn {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  // Resolves the Promise returned by stopRecording()
  const resolveRef       = useRef<((blob: Blob | null) => void) | null>(null);

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current?.state === "recording") return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];

    const options = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      // Stop all tracks so the mic indicator light goes off
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setRecordingState("idle");
      resolveRef.current?.(blob);
      resolveRef.current = null;
    };

    recorder.start(250);   // collect in 250 ms chunks for smoother stop
    setRecordingState("recording");
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      return Promise.resolve(null);
    }

    setRecordingState("processing");

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      recorder.stop();
    });
  }, []);

  return {
    recordingState,
    isRecording: recordingState === "recording",
    startRecording,
    stopRecording,
  };
}
