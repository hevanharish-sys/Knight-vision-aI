import type { AccessibilityProfile } from "@/lib/profile";

export type VoicePhase =
  | "idle"
  | "arrive"
  | "greet"
  | "auth_choice"
  | "auth_name"
  | "auth_pin"
  | "auth_confirm"
  | "profile_ask"
  | "profile_confirm"
  | "guide"
  | "ready"
  | "error";

export const PROFILE_VOICE_OPTIONS: {
  number: number;
  id: AccessibilityProfile;
  label: string;
  spoken: string;
}[] = [
  {
    number: 1,
    id: "blind",
    label: "Voice Guide",
    spoken: "one for Voice Guide",
  },
  {
    number: 2,
    id: "deaf",
    label: "Captions and Sign",
    spoken: "two for Captions and Sign",
  },
  {
    number: 3,
    id: "speech",
    label: "Type and Sign",
    spoken: "three for Type and Sign",
  },
  {
    number: 4,
    id: "low-vision",
    label: "Large and Clear",
    spoken: "four for Large and Clear",
  },
  {
    number: 5,
    id: "senior",
    label: "Simple Steps",
    spoken: "five for Simple Steps",
  },
  {
    number: 6,
    id: "autism",
    label: "Calm Focus",
    spoken: "six for Calm Focus",
  },
  {
    number: 7,
    id: "none",
    label: "Standard",
    spoken: "seven for Standard",
  },
];

export type GuideBeat = {
  id: string;
  title: string;
  body: string;
  spoken: string;
  href?: string;
};

export function buildVoiceGuide(profile: AccessibilityProfile): GuideBeat[] {
  if (profile === "blind" || profile === "low-vision") {
    return [
      {
        id: "g1",
        title: "Step 1 — Easy Mode",
        body: "I will take you through Easy Mode with huge buttons and voice commands.",
        spoken:
          "Step one. Easy Mode. I will guide you one step at a time. Say next when you are ready, or say repeat to hear again.",
        href: "/app/easy",
      },
      {
        id: "g2",
        title: "Step 2 — Describe",
        body: 'Say "describe" anytime to hear what is around you with the Vision Assistant.',
        spoken:
          'Step two. Surroundings. Say the word describe to open Vision and hear what is around you. Say next to continue.',
        href: "/app/vision?autostart=1",
      },
      {
        id: "g3",
        title: "Step 3 — Listen",
        body: 'Say "listen" for live speech captions in clinics and conversations.',
        spoken:
          'Step three. Listening. Say listen to open Speech captions. Say next to continue.',
        href: "/app/speech?autolisten=1",
      },
      {
        id: "g4",
        title: "Step 4 — Documents",
        body: 'Say "document" or "read" to simplify letters and prescriptions.',
        spoken:
          'Step four. Documents. Say document or read to open the Smart Document Reader. Say next to continue.',
        href: "/app/document",
      },
      {
        id: "g5",
        title: "Step 5 — Emergency SOS",
        body: 'Say "S O S" or "emergency" for help. The red SOS button is always available.',
        spoken:
          "Step five. Emergency. Say S O S or emergency for help. The red S O S button is always at the top. Say next to finish.",
      },
      {
        id: "g6",
        title: "You are ready",
        body: "You can say help anytime for commands. Opening Easy Mode now.",
        spoken:
          "You are ready. You can say help anytime for the command list. Opening Easy Mode now. Say start when you want to begin.",
        href: "/app/easy",
      },
    ];
  }

  if (profile === "deaf") {
    return [
      {
        id: "d1",
        title: "Step 1 — Captions",
        body: "Speech captions turn talk into large text. Sign ↔ Doctor helps in clinics.",
        spoken:
          "Step one for Captions and Sign mode. Use Speech captions and Sign Doctor Talk. Large text stays on. Say next.",
        href: "/app/speech",
      },
      {
        id: "d2",
        title: "Step 2 — Sign",
        body: "Open Sign for two-hand tracking and doctor conversation.",
        spoken: "Step two. Open Sign Language for clinic conversation. Say next.",
        href: "/app/sign",
      },
      {
        id: "d3",
        title: "Step 3 — Visual SOS",
        body: "SOS uses visual alerts and shows your medical card — no sound needed.",
        spoken: "Step three. S O S is visual. Your medical card appears on screen. You are ready.",
      },
    ];
  }

  return [
    {
      id: "n1",
      title: "Step 1 — Modules",
      body: "Use Speech, Sign, Vision, Translate, and Documents from Home.",
      spoken:
        "Step one. From Home, choose Speech, Sign, Vision, Translate, or Documents. Say next.",
      href: "/app",
    },
    {
      id: "n2",
      title: "Step 2 — SOS",
      body: "The orange SOS button shares location demo and medical details.",
      spoken: "Step two. Use the orange S O S button in emergencies. You are ready. Say done.",
    },
  ];
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  "1": 1,
  two: 2,
  "2": 2,
  three: 3,
  "3": 3,
  four: 4,
  "4": 4,
  five: 5,
  "5": 5,
  six: 6,
  "6": 6,
  seven: 7,
  "7": 7,
};

export function parseSpokenNumber(transcript: string): number | null {
  const text = transcript.toLowerCase().trim();
  if (!text) return null;

  // Bare digit anywhere (ASR often returns just "1")
  if (/^[1-7]$/.test(text)) return Number(text);

  const digit = text.match(/(?:^|\s)([1-7])(?:\s|$|[.,!?])/);
  if (digit) return Number(digit[1]);

  // "won" / "too" common ASR mistakes for one/two
  if (/\b(won|wun)\b/.test(text)) return 1;
  if (/\b(too|to)\b/.test(text) && !/\b(today|tomorrow|together|into)\b/.test(text)) {
    // only if short utterance
    if (text.split(/\s+/).length <= 3) return 2;
  }

  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return num;
  }

  const option = text.match(
    /(?:number|option|choice|press|say)\s*([1-7]|one|two|three|four|five|six|seven)/i
  );
  if (option) {
    const raw = option[1].toLowerCase();
    if (/^[1-7]$/.test(raw)) return Number(raw);
    return NUMBER_WORDS[raw] ?? null;
  }

  // first / second
  if (/\b(first|1st)\b/.test(text)) return 1;
  if (/\b(second|2nd)\b/.test(text)) return 2;

  return null;
}

export function parseYesNo(transcript: string): "yes" | "no" | null {
  const text = transcript.toLowerCase().trim();
  if (/\b(yes|yeah|yep|correct|confirm|ok|okay|sure|right)\b/.test(text)) {
    return "yes";
  }
  if (/\b(no|nope|wrong|cancel|back|change|again)\b/.test(text)) {
    return "no";
  }
  return null;
}

export function parseAuthChoice(transcript: string): "register" | "login" | null {
  const text = transcript.toLowerCase().trim();
  if (!text) return null;

  if (
    /\b(register|sign\s*up|create|new account|make account|sign up)\b/.test(text)
  ) {
    return "register";
  }
  if (/\b(login|log\s*in|sign\s*in|existing|already)\b/.test(text)) {
    return "login";
  }

  const n = parseSpokenNumber(text);
  if (n === 1) return "register";
  if (n === 2) return "login";

  // Very short answers
  if (text === "one" || text === "won") return "register";
  if (text === "two" || text === "too" || text === "to") return "login";

  return null;
}

export function parsePin(transcript: string): string | null {
  const digits = transcript.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(0, 4);

  const words = transcript.toLowerCase().split(/\s+/);
  const map: Record<string, string> = {
    zero: "0",
    oh: "0",
    o: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
  };
  let built = "";
  for (const w of words) {
    if (/^\d$/.test(w)) built += w;
    else if (map[w]) built += map[w];
  }
  return built.length >= 4 ? built.slice(0, 4) : null;
}

export function cleanSpokenName(transcript: string): string {
  return transcript
    .replace(/^(my name is|i am|i'm|this is|name is)\s+/i, "")
    .replace(/[^\p{L}\p{N}\s'-]/gu, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function profileAskSpeech(): string {
  return (
    "Please choose how you want Knight Vision to help you. " +
    "Say 1 for Voice Guide. " +
    "Say 2 for Captions and Sign. " +
    "Say 3 for Type and Sign. " +
    "Say 4 for Large and Clear. " +
    "Say 5 for Simple Steps. " +
    "Say 6 for Calm Focus. " +
    "Say 7 for Standard."
  );
}

export const VOICE_ONBOARD_KEY = "knight-vision-voice-onboarded";
export const VOICE_GUIDE_DONE_KEY = "knight-vision-voice-guide-done";
