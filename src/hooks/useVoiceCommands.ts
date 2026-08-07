"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  speak,
  stopSpeaking,
} from "@/lib/speech";
import { matchVoiceCommand, type EasyAction } from "@/lib/easy-mode";

type Options = {
  enabled: boolean;
  onCommand: (action: EasyAction, transcript: string) => void;
  onHeard?: (transcript: string, isFinal: boolean) => void;
  lang?: string;
  /** When true, ignore mic results (e.g. while TTS is talking). */
  paused?: boolean;
};

/**
 * Continuous command listener with auto-restart and interim quick-match.
 */
export function useVoiceCommands({
  enabled,
  onCommand,
  onHeard,
  lang = "en-US",
  paused = false,
}: Options) {
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(
    null
  );
  const onCommandRef = useRef(onCommand);
  const onHeardRef = useRef(onHeard);
  const wantListenRef = useRef(false);
  const pausedRef = useRef(paused);
  const lastFireRef = useRef(0);
  const interimTimerRef = useRef(0);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);
  useEffect(() => {
    onHeardRef.current = onHeard;
  }, [onHeard]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const fireCommand = useCallback((action: EasyAction, transcript: string) => {
    const now = Date.now();
    if (now - lastFireRef.current < 1400) return;
    lastFireRef.current = now;
    onCommandRef.current(action, transcript);
  }, []);

  const stop = useCallback(() => {
    wantListenRef.current = false;
    window.clearTimeout(interimTimerRef.current);
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      setSupported(false);
      return;
    }
    wantListenRef.current = true;
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }

    const recognition = createSpeechRecognition({
      lang,
      continuous: true,
      onStart: () => setListening(true),
      onResult: ({ transcript, isFinal }) => {
        if (!transcript.trim()) return;
        setLastHeard(transcript);
        onHeardRef.current?.(transcript, isFinal);

        if (pausedRef.current) return;

        const tryMatch = (text: string) => {
          const action = matchVoiceCommand(text);
          if (action) fireCommand(action, text);
          return Boolean(action);
        };

        if (isFinal) {
          window.clearTimeout(interimTimerRef.current);
          tryMatch(transcript);
          return;
        }

        // Quick-match clear short commands from interim results
        window.clearTimeout(interimTimerRef.current);
        interimTimerRef.current = window.setTimeout(() => {
          if (pausedRef.current) return;
          tryMatch(transcript);
        }, 450);
      },
      onError: (error) => {
        if (error === "not-allowed") setSupported(false);
        setListening(false);
      },
      onEnd: () => {
        setListening(false);
        if (!wantListenRef.current) return;
        window.setTimeout(() => {
          if (!wantListenRef.current) return;
          try {
            recognition.start();
            setListening(true);
          } catch {
            window.setTimeout(() => {
              if (!wantListenRef.current) return;
              try {
                recognition.start();
                setListening(true);
              } catch {
                /* give up this cycle */
              }
            }, 600);
          }
        }, 280);
      },
    });

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      setSupported(true);
    } catch {
      setListening(false);
      window.setTimeout(() => {
        if (!wantListenRef.current) return;
        try {
          recognition.start();
          setListening(true);
        } catch {
          /* ignore */
        }
      }, 500);
    }
  }, [fireCommand, lang]);

  useEffect(() => {
    if (enabled) start();
    else stop();
    return () => stop();
  }, [enabled, start, stop]);

  return { listening, lastHeard, supported, start, stop, speak, stopSpeaking };
}
