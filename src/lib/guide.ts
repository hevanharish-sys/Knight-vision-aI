import type { AccessibilityProfile } from "@/lib/profile";

export type GuideStep = {
  id: string;
  title: string;
  body: string;
  href?: string;
  cta?: string;
};

const PROFILE_WELCOME: Record<
  AccessibilityProfile,
  { title: string; body: string; priorities: string[] }
> = {
  blind: {
    title: "Welcome — Easy Mode is ready",
    body: "You will land in Easy Mode: huge buttons and voice commands like describe, listen, and S O S. Everything important is spoken aloud.",
    priorities: ["/app/easy", "/app/vision", "/app/document", "/app/speech"],
  },
  deaf: {
    title: "Welcome — captions first",
    body: "Everything important appears as large text. Sign Language and Speech captions are highlighted for you. Visual alerts replace sound cues.",
    priorities: ["/app/sign", "/app/speech", "/app/translate", "/app/document"],
  },
  speech: {
    title: "Welcome — speak with type or sign",
    body: "You do not need to speak. Use Sign Interpreter or type into Translate and Documents. Outputs can be spoken for others.",
    priorities: ["/app/sign", "/app/translate", "/app/document", "/app/speech"],
  },
  "low-vision": {
    title: "Welcome — Easy Mode + high contrast",
    body: "Easy Mode gives very large high-contrast buttons and voice commands. Vision and Document Reader stay one tap away.",
    priorities: ["/app/easy", "/app/vision", "/app/speech", "/app/document"],
  },
  senior: {
    title: "Welcome — simple steps",
    body: "We will go one step at a time. Big buttons, calm screens. Start with Speech captions or ask family to help with Documents. SOS is the red button.",
    priorities: ["/app/speech", "/app/document", "/app/translate", "/app/hub"],
  },
  autism: {
    title: "Welcome — predictable guide",
    body: "Same layout every time. Short clear steps. Reduced motion. You can pause or skip the guide whenever you want.",
    priorities: ["/app/speech", "/app/translate", "/app/document", "/app/hub"],
  },
  none: {
    title: "Welcome to Knight Vision AI",
    body: "I will guide you through each module. Use Speech, Sign, Vision, Translate, Documents, Hub, and SOS. Change your comfort mode anytime in the header.",
    priorities: ["/app/speech", "/app/sign", "/app/vision", "/app/translate"],
  },
};

const MODULE_GUIDES: Record<
  string,
  Partial<Record<AccessibilityProfile | "default", GuideStep>> & {
    default: GuideStep;
  }
> = {
  "/app": {
    default: {
      id: "hub",
      title: "Module hub",
      body: "Pick a module below. I recommend starting with the highlighted cards for your profile. The red SOS button is always in the top right.",
      cta: "Got it",
    },
    blind: {
      id: "hub-blind",
      title: "Your starting point",
      body: "Open Vision Assistant to hear what is around you, or Document Reader for letters and prescriptions. I can speak every tip aloud.",
      href: "/app/vision",
      cta: "Open Vision",
    },
    deaf: {
      id: "hub-deaf",
      title: "Your starting point",
      body: "Open Sign Language to communicate with hand signs, or Speech for large live captions when someone talks.",
      href: "/app/sign",
      cta: "Open Sign",
    },
    speech: {
      id: "hub-speech",
      title: "Your starting point",
      body: "Use Sign Language or type in Translate. Others can hear the spoken result even if you do not speak.",
      href: "/app/sign",
      cta: "Open Sign",
    },
    "low-vision": {
      id: "hub-lv",
      title: "Your starting point",
      body: "Vision and Speech use large text. Document Reader can read notices out loud.",
      href: "/app/vision",
      cta: "Open Vision",
    },
    senior: {
      id: "hub-senior",
      title: "Your starting point",
      body: "Tap Speech to see large captions when someone talks. For emergencies, tap the red SOS button.",
      href: "/app/speech",
      cta: "Open Speech",
    },
    autism: {
      id: "hub-autism",
      title: "Your starting point",
      body: "Choose one module. Each screen has the same header and SOS button. You can return here anytime via Modules.",
      cta: "Continue",
    },
    none: {
      id: "hub-none",
      title: "Tour the modules",
      body: "Start with Speech for captions, Sign for hand communication, or Vision for scene descriptions.",
      href: "/app/speech",
      cta: "Start with Speech",
    },
  },
  "/app/speech": {
    default: {
      id: "speech",
      title: "Speech ↔ Text",
      body: "Tap Start listening and speak, or use Gemini clip for a 5-second recording. Large captions appear here. Save sessions to the Hub.",
    },
    blind: {
      id: "speech-blind",
      title: "Speech guide",
      body: "Tap Start listening. I will also speak results when useful. Use hospital demo lines to practice without speaking yourself.",
    },
    deaf: {
      id: "speech-deaf",
      title: "Captions guide",
      body: "Ask the other person to speak. Captions appear in large text. You do not need the speaker. Try a hospital demo line to see the format.",
    },
    senior: {
      id: "speech-senior",
      title: "Easy captions",
      body: "Press the green Start listening button. When someone talks, big words appear. Press Stop when finished.",
    },
  },
  "/app/sign": {
    default: {
      id: "sign",
      title: "Sign Language",
      body: "Choose your sign language, then use AI mode to Interpret, or Fast mode for emergency poses like HELP and PAIN.",
    },
    deaf: {
      id: "sign-deaf",
      title: "Sign guide",
      body: "Pick Indian Sign Language or another language. Hold a clear sign, then tap Interpret. Doctor can speak for reverse captions.",
    },
    speech: {
      id: "sign-speech",
      title: "Sign instead of voice",
      body: "Use signs to create spoken messages for others. Try Fast mode open palm for HELP if you need something quickly.",
    },
    blind: {
      id: "sign-blind",
      title: "Sign module note",
      body: "This module is camera-based. A companion can help, or switch to Speech and Vision which are voice-first for you.",
      href: "/app/vision",
      cta: "Go to Vision",
    },
  },
  "/app/vision": {
    default: {
      id: "vision",
      title: "Vision Assistant",
      body: "Point the camera and tap Describe now, or turn on Live mode. The AI describes hazards, signs, medicine labels, and currency.",
    },
    blind: {
      id: "vision-blind",
      title: "Seeing with sound",
      body: "Point your phone forward and tap Describe now. I will speak what is ahead. Live mode repeats every few seconds.",
    },
    "low-vision": {
      id: "vision-lv",
      title: "Vision guide",
      body: "Use Describe now for a clear spoken and written summary. Good for medicine bottles and room navigation.",
    },
  },
  "/app/translate": {
    default: {
      id: "translate",
      title: "Live Translator",
      body: "Pick From and To languages, type or dictate, then Translate. The result is spoken aloud when possible.",
    },
    senior: {
      id: "translate-senior",
      title: "Language helper",
      body: "Choose your language and the other person's language. Type a sentence or use the microphone, then press Translate.",
    },
  },
  "/app/document": {
    default: {
      id: "document",
      title: "Document Reader",
      body: "Upload a photo of a prescription, bill, or letter. Knight Vision explains it in simple words and can narrate it.",
    },
    blind: {
      id: "document-blind",
      title: "Reading aloud",
      body: "Ask someone to help capture the document photo, then tap Simplify. The explanation is spoken for you.",
    },
    "low-vision": {
      id: "document-lv",
      title: "Simple reading",
      body: "Upload a clear photo. You get a plain summary in large text plus optional narration.",
    },
  },
  "/app/hub": {
    default: {
      id: "conv-hub",
      title: "Conversation Hub",
      body: "Past transcripts, translations, vision notes, and SOS events are saved on this device for doctors and family.",
    },
  },
  "/app/easy": {
    default: {
      id: "easy",
      title: "Easy Mode",
      body: "Say describe, listen, read document, translate, or S O S. Or tap the huge buttons. Made for Voice Guide and Large & Clear modes.",
      cta: "Got it",
    },
    blind: {
      id: "easy-blind",
      title: "Your Easy Mode",
      body: "Voice commands are listening. Say describe to hear surroundings. Say help for the full command list. SOS is the red button.",
    },
    "low-vision": {
      id: "easy-lv",
      title: "Your Easy Mode",
      body: "Use the large black buttons, or speak commands. High contrast text stays readable. Describe is the first action.",
    },
  },
};

export function getWelcome(profile: AccessibilityProfile) {
  return PROFILE_WELCOME[profile] || PROFILE_WELCOME.none;
}

export function getModuleGuide(
  pathname: string,
  profile: AccessibilityProfile
): GuideStep {
  const key =
    Object.keys(MODULE_GUIDES).find(
      (route) => pathname === route || (route !== "/app" && pathname.startsWith(route))
    ) || "/app";
  const set = MODULE_GUIDES[key];
  return set[profile] || set.default;
}

export function buildWelcomeTour(profile: AccessibilityProfile): GuideStep[] {
  const welcome = getWelcome(profile);
  const steps: GuideStep[] = [
    {
      id: "welcome",
      title: welcome.title,
      body: welcome.body,
      cta: "Next",
    },
    {
      id: "sos",
      title: "Emergency SOS",
      body: "The red SOS button shares your location demo, shows your medical profile, and announces that you need help in a local language.",
      cta: "Next",
    },
    {
      id: "profile",
      title: "Your accessibility profile",
      body: `You selected a profile that changes captions, voice, button size, and recommended modules. Change it anytime from the Profile menu.`,
      cta: "Next",
    },
    {
      id: "start",
      title: "Let's begin",
      body: "I will stay available as your Guide on every screen. Tap the Guide button whenever you need help.",
      href: welcome.priorities[0],
      cta: "Start guided module",
    },
  ];
  return steps;
}

export const GUIDE_DISMISSED_KEY = "knight-vision-guide-welcome-done";
export const GUIDE_MUTE_KEY = "knight-vision-guide-mute";
