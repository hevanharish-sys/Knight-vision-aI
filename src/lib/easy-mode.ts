export type EasyActionId =
  | "describe"
  | "listen"
  | "sign"
  | "document"
  | "translate"
  | "sos"
  | "help"
  | "home"
  | "hub"
  | "modules"
  | "orb_off"
  | "orb_on"
  | "repeat";

export type EasyAction = {
  id: EasyActionId;
  label: string;
  spoken: string;
  href?: string;
  keywords: string[];
};

export const VOICE_ORB_KEY = "knight-vision-voice-orb";

export const EASY_ACTIONS: EasyAction[] = [
  {
    id: "describe",
    label: "Describe surroundings",
    spoken: "Opening Vision Assistant to describe what is around you.",
    href: "/app/vision?autostart=1",
    keywords: [
      "describe",
      "vision",
      "see",
      "look",
      "surroundings",
      "what is around",
      "what's around",
      "camera",
      "where am i",
    ],
  },
  {
    id: "listen",
    label: "Listen & captions",
    spoken: "Opening Speech captions so you can hear and follow spoken words as text.",
    href: "/app/speech?autolisten=1",
    keywords: ["listen", "speech", "caption", "captions", "hear", "talk", "doctor"],
  },
  {
    id: "sign",
    label: "Sign language",
    spoken: "Opening Sign Interpreter.",
    href: "/app/sign",
    keywords: ["sign", "signing", "gesture", "hand", "asl", "isl"],
  },
  {
    id: "document",
    label: "Read a document",
    spoken: "Opening Document Reader. Upload or capture a letter or prescription to hear a simple explanation.",
    href: "/app/document",
    keywords: [
      "document",
      "read",
      "letter",
      "prescription",
      "bill",
      "paper",
      "notice",
    ],
  },
  {
    id: "translate",
    label: "Translate language",
    spoken: "Opening Live Translator.",
    href: "/app/translate",
    keywords: ["translate", "translation", "language", "hindi", "tamil", "telugu"],
  },
  {
    id: "sos",
    label: "Emergency SOS",
    spoken: "Opening emergency SOS.",
    keywords: ["sos", "emergency", "help me", "medical help", "ambulance"],
  },
  {
    id: "help",
    label: "Help / commands",
    spoken:
      "You can say: describe, listen, sign, read document, translate, S O S, home, hub, or turn off.",
    keywords: ["help", "commands", "what can i say", "options", "menu"],
  },
  {
    id: "home",
    label: "Easy home",
    spoken: "Going to Easy Mode home.",
    href: "/app/easy",
    keywords: ["home", "easy", "main", "start", "menu"],
  },
  {
    id: "modules",
    label: "Module hub",
    spoken: "Opening the module hub.",
    href: "/app",
    keywords: ["modules", "hub home", "module hub", "dashboard"],
  },
  {
    id: "hub",
    label: "Conversation hub",
    spoken: "Opening Conversation Hub.",
    href: "/app/hub",
    keywords: ["hub", "history", "conversations", "past"],
  },
  {
    id: "orb_off",
    label: "Turn voice orb off",
    spoken: "Voice navigation is off. Say turn on anytime, or tap the orb.",
    keywords: [
      "turn off",
      "orb off",
      "stop listening",
      "voice off",
      "quiet",
      "mute assistant",
      "off mode",
    ],
  },
  {
    id: "orb_on",
    label: "Turn voice orb on",
    spoken: "Voice navigation is on. I am listening for page commands.",
    keywords: ["turn on", "orb on", "start listening", "voice on", "wake up"],
  },
  {
    id: "repeat",
    label: "Repeat last",
    spoken: "",
    keywords: ["repeat", "again", "say again", "what did you say"],
  },
];

export function matchVoiceCommand(transcript: string): EasyAction | null {
  const raw = transcript.toLowerCase().trim();
  if (!raw) return null;
  // Normalize ASR quirks
  const text = raw
    .replace(/[’']/g, "'")
    .replace(/\bwhats\b/g, "what's")
    .replace(/\bvision assistant\b/g, "vision")
    .replace(/\bopen\s+/g, "")
    .replace(/\bgo\s+to\s+/g, "")
    .replace(/\btake\s+me\s+to\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Prefer longer / more specific keyword matches
  let best: { action: EasyAction; score: number } | null = null;
  for (const action of EASY_ACTIONS) {
    for (const keyword of action.keywords) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$|[.,!?])`, "i");
      const loose =
        keyword.includes(" ") || keyword.length >= 5
          ? text.includes(keyword)
          : false;
      if (re.test(text) || text === keyword || loose) {
        const score =
          keyword.length +
          (text === keyword ? 20 : 0) +
          (keyword.includes(" ") ? 8 : 0);
        if (!best || score > best.score) {
          best = { action, score };
        }
      }
    }
  }
  return best?.action || null;
}

export function isVisionEasyProfile(profile: string | null | undefined) {
  return profile === "blind" || profile === "low-vision";
}
