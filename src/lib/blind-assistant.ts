import { matchVoiceCommand, type EasyAction } from "@/lib/easy-mode";

export type BlindTurn = {
  id: string;
  role: "assistant" | "user";
  text: string;
  at: number;
};

/** Confirm what the user said, then return matched action if any. */
export function interpretBlindUtterance(transcript: string): {
  heard: string;
  action: EasyAction | null;
  confirmSpeech: string;
  responseSpeech: string;
} {
  const heard = transcript.trim().replace(/\s+/g, " ");
  const action = matchVoiceCommand(heard);

  if (!heard) {
    return {
      heard: "",
      action: null,
      confirmSpeech: "I did not hear anything. Please speak again after the tone.",
      responseSpeech: "",
    };
  }

  const confirmSpeech = `I heard: ${heard}.`;

  if (!action) {
    return {
      heard,
      action: null,
      confirmSpeech,
      responseSpeech:
        "I did not catch a command. Say help for the list, or say describe, listen, document, translate, or S O S.",
    };
  }

  return {
    heard,
    action,
    confirmSpeech,
    responseSpeech: action.spoken || `Okay. ${action.label}.`,
  };
}

export const BLIND_INTRO =
  "Welcome to Easy Mode. I am your Knight Vision voice assistant. " +
  "I will listen after I finish speaking. " +
  "Say describe, listen, read document, translate, help, or S O S. " +
  "I am listening now.";

export const BLIND_LISTEN_PROMPT = "I'm listening.";
