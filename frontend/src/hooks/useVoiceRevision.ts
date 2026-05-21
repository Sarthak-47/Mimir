/**
 * useVoiceRevision — state machine for hands-free voice quiz sessions.
 *
 * Loop
 * ----
 * generating → speaking_q → listening → transcribing → marking → speaking_fb → between
 *     ↑_________________________________________________________|  (next question)
 *
 * Usage
 * -----
 * ```tsx
 * const vr = useVoiceRevision(authToken);
 * // Start a session
 * await vr.start("Newton's Laws", "Physics", topicId);
 * // User is now listening — mic is open
 * // When done speaking:
 * await vr.doneListening();
 * // After feedback plays:
 * await vr.nextQuestion();  // or vr.endSession()
 * ```
 */

import { useState, useRef, useCallback } from "react";
import useTTS from "./useTTS";
import useAudioRecorder from "./useAudioRecorder";
import { API_QUIZ, API_VOICE } from "@/config";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RevisionPhase =
  | "idle"           // not started
  | "generating"     // fetching question from LLM
  | "speaking_q"     // TTS reading the question aloud
  | "listening"      // mic open — user is speaking their answer
  | "transcribing"   // converting audio blob → text
  | "marking"        // LLM evaluating the answer
  | "speaking_fb"    // TTS reading feedback/score aloud
  | "between"        // feedback shown, waiting for Next or End
  | "done";          // session finished

export interface RevisionResult {
  question:      string;
  transcript:    string;
  marks_awarded: number;
  max_marks:     number;
  percentage:    number;
  feedback:      string;
  verdict:       string;
}

export interface WrittenQuestion {
  question:     string;
  answer_guide: string;
  max_marks:    number;
}

export interface MarkResult {
  marks_awarded:  number;
  max_marks:      number;
  percentage:     number;
  verdict:        string;
  feedback:       string;
  awarded_points: string[];
  missed_points:  string[];
  message:        string;
}

export interface UseVoiceRevisionReturn {
  phase:         RevisionPhase;
  question:      WrittenQuestion | null;
  transcript:    string;
  currentResult: MarkResult | null;
  results:       RevisionResult[];
  qNumber:       number;
  error:         string;
  isSpeaking:    boolean;
  isRecording:   boolean;
  start:         (topic: string, subject: string, topicId?: number) => Promise<void>;
  doneListening: () => Promise<void>;
  nextQuestion:  () => Promise<void>;
  endSession:    () => void;
  clearError:    () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export default function useVoiceRevision(authToken: string): UseVoiceRevisionReturn {
  const { speak, stop: stopSpeaking, isSpeaking } = useTTS(authToken);
  const { startRecording, stopRecording, isRecording } = useAudioRecorder();

  const [phase,         setPhase]         = useState<RevisionPhase>("idle");
  const [question,      setQuestion]      = useState<WrittenQuestion | null>(null);
  const [transcript,    setTranscript]    = useState("");
  const [currentResult, setCurrentResult] = useState<MarkResult | null>(null);
  const [results,       setResults]       = useState<RevisionResult[]>([]);
  const [qNumber,       setQNumber]       = useState(0);
  const [error,         setError]         = useState("");

  // Session config stored in refs to avoid stale closure issues
  const topicRef   = useRef("");
  const subjectRef = useRef("");
  const topicIdRef = useRef<number | null>(null);
  const qRef       = useRef(0);   // mirrors qNumber for use inside async callbacks

  const clearError = useCallback(() => setError(""), []);

  // ── Core async step: generate a question and speak it ─────────────────────

  const _generateAndSpeak = useCallback(async () => {
    setPhase("generating");
    setTranscript("");
    setCurrentResult(null);

    try {
      const res = await fetch(`${API_QUIZ}/generate-written`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          topic:   topicRef.current,
          subject: subjectRef.current,
        }),
      });
      if (!res.ok) throw new Error(`Question generation failed (${res.status})`);
      const q: WrittenQuestion = await res.json();
      setQuestion(q);

      qRef.current += 1;
      setQNumber(qRef.current);

      // Speak the question — speak() now awaits full playback
      setPhase("speaking_q");
      await speak(`Question ${qRef.current}. ${q.question}`);

      // Auto-open mic once TTS finishes
      setPhase("listening");
      await startRecording();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("idle");
    }
  }, [authToken, speak, startRecording]);

  // ── Public API ─────────────────────────────────────────────────────────────

  const start = useCallback(async (
    topic:    string,
    subject:  string,
    topicId?: number,
  ) => {
    topicRef.current   = topic;
    subjectRef.current = subject;
    topicIdRef.current = topicId ?? null;
    qRef.current       = 0;
    setResults([]);
    setQNumber(0);
    setError("");
    await _generateAndSpeak();
  }, [_generateAndSpeak]);

  const doneListening = useCallback(async () => {
    if (phase !== "listening") return;
    setPhase("transcribing");

    try {
      const blob = await stopRecording();
      if (!blob) throw new Error("No audio recorded");

      // ── STT ──────────────────────────────────────────────────────────────
      const formData = new FormData();
      formData.append("audio", blob, "answer.webm");
      const tRes = await fetch(`${API_VOICE}/transcribe`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body:    formData,
      });
      if (!tRes.ok) throw new Error(`Transcription failed (${tRes.status})`);
      const { text }: { text: string } = await tRes.json();
      setTranscript(text);

      if (!text.trim()) {
        // Nothing was said — go back to listening
        setPhase("listening");
        await startRecording();
        return;
      }

      // ── Mark ─────────────────────────────────────────────────────────────
      setPhase("marking");
      const mRes = await fetch(`${API_QUIZ}/mark-text`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          topic_id:     topicIdRef.current,
          question:     question!.question,
          answer_guide: question!.answer_guide,
          answer:       text,
          max_marks:    question!.max_marks,
        }),
      });
      if (!mRes.ok) throw new Error(`Marking failed (${mRes.status})`);
      const result: MarkResult = await mRes.json();
      setCurrentResult(result);

      // Store result for end-of-session summary
      setResults(prev => [
        ...prev,
        {
          question:      question!.question,
          transcript:    text,
          marks_awarded: result.marks_awarded,
          max_marks:     result.max_marks,
          percentage:    result.percentage,
          feedback:      result.feedback,
          verdict:       result.verdict,
        },
      ]);

      // ── Speak feedback ────────────────────────────────────────────────────
      setPhase("speaking_fb");
      const scoreWord =
        result.percentage >= 80 ? "Excellent." :
        result.percentage >= 60 ? "Well done." :
        result.percentage >= 40 ? "Partial credit." :
        "Needs work.";
      const fbText =
        `${scoreWord} ${result.marks_awarded} out of ${result.max_marks}. ${result.feedback}`;
      await speak(fbText);

      setPhase("between");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("idle");
    }
  }, [phase, authToken, speak, stopRecording, startRecording, question]);

  const nextQuestion = useCallback(async () => {
    await _generateAndSpeak();
  }, [_generateAndSpeak]);

  const endSession = useCallback(() => {
    stopSpeaking();
    // stopRecording returns a Promise but we discard the blob here
    if (isRecording) stopRecording().catch(() => {});
    setPhase("done");
  }, [stopSpeaking, stopRecording, isRecording]);

  return {
    phase,
    question,
    transcript,
    currentResult,
    results,
    qNumber,
    error,
    isSpeaking,
    isRecording,
    start,
    doneListening,
    nextQuestion,
    endSession,
    clearError,
  };
}
