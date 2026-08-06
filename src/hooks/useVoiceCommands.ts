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
  lang?: string;
};

/** Continuous wake-style command listener for Voice Guide / Large & Clear Easy Mode. */
export function useVoiceCommands({ enabled, onCommand, lang = "en-IN" }: Options) {
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition> | null>(
    null
  );
  const onCommandRef = useRef(onCommand);
  const wantListenRef = useRef(false);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  const stop = useCallback(() => {
    wantListenRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      setSupported(false);
      return;
    }
    wantListenRef.current = true;
    recognitionRef.current?.abort();

    const recognition = createSpeechRecognition({
      lang,
      continuous: true,
      onResult: ({ transcript, isFinal }) => {
        setLastHeard(transcript);
        if (!isFinal) return;
        const action = matchVoiceCommand(transcript);
        if (action) {
          onCommandRef.current(action, transcript);
        }
      },
      onError: () => {
        setListening(false);
      },
      onEnd: () => {
        setListening(false);
        // Auto-restart while Easy Mode wants listening
        if (wantListenRef.current) {
          window.setTimeout(() => {
            if (!wantListenRef.current) return;
            try {
              recognition.start();
              setListening(true);
            } catch {
              /* already started */
            }
          }, 400);
        }
      },
    });

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      setSupported(true);
    } catch {
      setListening(false);
    }
  }, [lang]);

  useEffect(() => {
    if (enabled) start();
    else stop();
    return () => stop();
  }, [enabled, start, stop]);

  return { listening, lastHeard, supported, start, stop, speak, stopSpeaking };
}
