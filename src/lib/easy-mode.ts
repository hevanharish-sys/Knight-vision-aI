export type EasyActionId =
  | "describe"
  | "listen"
  | "document"
  | "translate"
  | "sos"
  | "help"
  | "home"
  | "hub"
  | "repeat";

export type EasyAction = {
  id: EasyActionId;
  label: string;
  spoken: string;
  href?: string;
  keywords: string[];
};

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
      "You can say: describe, listen, read document, translate, S O S, home, or repeat.",
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
    id: "hub",
    label: "Conversation hub",
    spoken: "Opening Conversation Hub.",
    href: "/app/hub",
    keywords: ["hub", "history", "conversations", "past"],
  },
  {
    id: "repeat",
    label: "Repeat last",
    spoken: "",
    keywords: ["repeat", "again", "say again", "what did you say"],
  },
];

export function matchVoiceCommand(transcript: string): EasyAction | null {
  const text = transcript.toLowerCase().trim();
  if (!text) return null;

  // Prefer longer / more specific keyword matches
  let best: { action: EasyAction; score: number } | null = null;
  for (const action of EASY_ACTIONS) {
    for (const keyword of action.keywords) {
      if (text.includes(keyword)) {
        const score = keyword.length;
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
