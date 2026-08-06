export type Landmark = { x: number; y: number; z: number };

export type GestureResult = {
  label: string;
  kind: "letter" | "phrase";
  confidence: number;
  spoken: string;
};

export type HandFeatures = {
  thumbUp: boolean;
  thumbOut: boolean;
  indexUp: boolean;
  middleUp: boolean;
  ringUp: boolean;
  pinkyUp: boolean;
  allFingersUp: boolean;
  fist: boolean;
  openPalm: boolean;
  okCircle: boolean;
  peace: boolean;
  threeFingers: boolean;
  point: boolean;
  lShape: boolean;
  yShape: boolean;
  cShape: boolean;
  thumbDown: boolean;
  extendedCount: number;
  summary: string;
};

const TIP = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
const PIP = { thumb: 3, index: 6, middle: 10, ring: 14, pinky: 18 };
const MCP = { thumb: 2, index: 5, middle: 9, ring: 13, pinky: 17 };
const WRIST = 0;

function dist(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

/** Finger is extended when tip is farther from wrist than pip, and tip is above pip. */
function isFingerUp(landmarks: Landmark[], tip: number, pip: number) {
  const tipY = landmarks[tip].y;
  const pipY = landmarks[pip].y;
  const wrist = landmarks[WRIST];
  const tipDist = dist(landmarks[tip], wrist);
  const pipDist = dist(landmarks[pip], wrist);
  return tipY < pipY - 0.015 && tipDist > pipDist * 0.95;
}

function isFingerDown(landmarks: Landmark[], tip: number, mcp: number) {
  return landmarks[tip].y > landmarks[mcp].y - 0.005;
}

export function extractHandFeatures(landmarks: Landmark[]): HandFeatures | null {
  if (!landmarks || landmarks.length < 21) return null;

  const indexUp = isFingerUp(landmarks, TIP.index, PIP.index);
  const middleUp = isFingerUp(landmarks, TIP.middle, PIP.middle);
  const ringUp = isFingerUp(landmarks, TIP.ring, PIP.ring);
  const pinkyUp = isFingerUp(landmarks, TIP.pinky, PIP.pinky);

  const indexDown = isFingerDown(landmarks, TIP.index, MCP.index);
  const middleDown = isFingerDown(landmarks, TIP.middle, MCP.middle);
  const ringDown = isFingerDown(landmarks, TIP.ring, MCP.ring);
  const pinkyDown = isFingerDown(landmarks, TIP.pinky, MCP.pinky);

  const thumbTip = landmarks[TIP.thumb];
  const thumbIp = landmarks[PIP.thumb];
  const indexMcp = landmarks[MCP.index];
  const pinkyMcp = landmarks[MCP.pinky];
  const wrist = landmarks[WRIST];

  // Handedness-agnostic thumb open: tip far from index MCP horizontally/overall
  const thumbOut = dist(thumbTip, indexMcp) > dist(thumbIp, indexMcp) * 1.15;
  const thumbUp =
    thumbTip.y < landmarks[TIP.index].y - 0.02 &&
    thumbTip.y < wrist.y - 0.05 &&
    dist(thumbTip, wrist) > dist(indexMcp, wrist) * 0.55;
  const thumbDown =
    thumbTip.y > landmarks[TIP.index].y + 0.04 &&
    thumbTip.y > wrist.y - 0.02 &&
    indexDown &&
    middleDown;

  const okCircle = dist(thumbTip, landmarks[TIP.index]) < 0.045;
  const peace = indexUp && middleUp && !ringUp && !pinkyUp;
  const threeFingers = indexUp && middleUp && ringUp && !pinkyUp;
  const point = indexUp && !middleUp && !ringUp && !pinkyUp && !thumbOut;
  const lShape = indexUp && !middleUp && !ringUp && !pinkyUp && thumbOut;
  const yShape = !indexUp && !middleUp && !ringUp && pinkyUp && thumbOut;
  const openPalm = indexUp && middleUp && ringUp && pinkyUp;
  const fist = indexDown && middleDown && ringDown && pinkyDown && !thumbUp;
  const cShape =
    dist(thumbTip, landmarks[TIP.index]) > 0.04 &&
    dist(thumbTip, landmarks[TIP.index]) < 0.14 &&
    dist(thumbTip, pinkyMcp) > 0.08;

  let extendedCount = 0;
  if (indexUp) extendedCount += 1;
  if (middleUp) extendedCount += 1;
  if (ringUp) extendedCount += 1;
  if (pinkyUp) extendedCount += 1;
  if (thumbOut || thumbUp) extendedCount += 1;

  const parts = [
    thumbUp ? "thumbUP" : thumbDown ? "thumbDOWN" : thumbOut ? "thumbOUT" : "thumbIN",
    indexUp ? "indexUP" : "indexDOWN",
    middleUp ? "middleUP" : "middleDOWN",
    ringUp ? "ringUP" : "ringDOWN",
    pinkyUp ? "pinkyUP" : "pinkyDOWN",
  ];

  return {
    thumbUp,
    thumbOut,
    indexUp,
    middleUp,
    ringUp,
    pinkyUp,
    allFingersUp: openPalm,
    fist,
    openPalm,
    okCircle,
    peace,
    threeFingers,
    point,
    lShape,
    yShape,
    cShape,
    thumbDown,
    extendedCount,
    summary: parts.join(" "),
  };
}

export const PHRASE_SPEECH: Record<string, string> = {
  HELP: "I need help.",
  HELLO: "Hello.",
  PAIN: "I am in pain.",
  "CHEST PAIN": "I have chest pain.",
  WATER: "I need water.",
  YES: "Yes.",
  NO: "No.",
  DOCTOR: "I need a doctor.",
  OK: "I am okay.",
  MEDICINE: "I need medicine.",
  HUNGRY: "I am hungry.",
  TOILET: "I need the toilet.",
  FAMILY: "Please call my family.",
  ALLERGY: "I have an allergy.",
  EMERGENCY: "This is an emergency.",
  THANKS: "Thank you.",
  PLEASE: "Please.",
  STOP: "Please stop.",
  WAIT: "Please wait.",
  NAME: "My name is…",
};

export type TrackedHand = {
  label: "Left" | "Right" | "Hand";
  landmarks: Landmark[];
  features: HandFeatures;
};

/** Summarize one or two hands for the AI + UI. */
export function summarizeHands(hands: TrackedHand[]) {
  if (!hands.length) return "no hands";
  return hands
    .map((h, i) => `${h.label || `Hand${i + 1}`}: ${h.features.summary}`)
    .join(" | ");
}

/**
 * Two-hand clinic signs (most real sign languages use both hands).
 * Call this when 1–2 hands are tracked.
 */
export function classifyTwoHandGesture(hands: TrackedHand[]): GestureResult | null {
  if (!hands.length) return null;

  if (hands.length === 1) {
    return classifyGesture(hands[0].landmarks);
  }

  const [a, b] = hands;
  const fa = a.features;
  const fb = b.features;
  const wristDist = dist(a.landmarks[0], b.landmarks[0]);

  // Both open palms → HELLO / HELP
  if (fa.openPalm && fb.openPalm) {
    return {
      label: wristDist < 0.35 ? "HELLO" : "HELP",
      kind: "phrase",
      confidence: 0.93,
      spoken: wristDist < 0.35 ? PHRASE_SPEECH.HELLO : PHRASE_SPEECH.HELP,
    };
  }

  // Both fists → PAIN / EMERGENCY
  if (fa.fist && fb.fist) {
    return {
      label: "EMERGENCY",
      kind: "phrase",
      confidence: 0.9,
      spoken: PHRASE_SPEECH.EMERGENCY,
    };
  }

  // Hands close together (prayer / please / thanks)
  if (wristDist < 0.18 && (fa.openPalm || fb.openPalm)) {
    return {
      label: "THANKS",
      kind: "phrase",
      confidence: 0.84,
      spoken: PHRASE_SPEECH.THANKS,
    };
  }

  // One pointing + other open/fist → DOCTOR
  if ((fa.point && (fb.openPalm || fb.fist)) || (fb.point && (fa.openPalm || fa.fist))) {
    return {
      label: "DOCTOR",
      kind: "phrase",
      confidence: 0.88,
      spoken: PHRASE_SPEECH.DOCTOR,
    };
  }

  // Thumbs up on either hand
  if (fa.thumbUp || fb.thumbUp) {
    return { label: "YES", kind: "phrase", confidence: 0.86, spoken: PHRASE_SPEECH.YES };
  }
  if (fa.thumbDown || fb.thumbDown) {
    return { label: "NO", kind: "phrase", confidence: 0.86, spoken: PHRASE_SPEECH.NO };
  }

  // Fall back to best single-hand read
  return classifyGesture(a.landmarks) || classifyGesture(b.landmarks);
}

/** Robust pose classifier from MediaPipe landmarks. */
export function classifyGesture(landmarks: Landmark[]): GestureResult | null {
  const f = extractHandFeatures(landmarks);
  if (!f) return null;

  // Priority order: most specific first
  if (f.okCircle && (f.middleUp || f.ringUp)) {
    return { label: "OK", kind: "phrase", confidence: 0.9, spoken: PHRASE_SPEECH.OK };
  }
  if (f.thumbUp && f.fist) {
    return { label: "YES", kind: "phrase", confidence: 0.9, spoken: PHRASE_SPEECH.YES };
  }
  if (f.thumbDown) {
    return { label: "NO", kind: "phrase", confidence: 0.88, spoken: PHRASE_SPEECH.NO };
  }
  if (f.peace) {
    const spread = dist(landmarks[TIP.index], landmarks[TIP.middle]);
    if (spread > 0.04) {
      return {
        label: "CHEST PAIN",
        kind: "phrase",
        confidence: 0.86,
        spoken: PHRASE_SPEECH["CHEST PAIN"],
      };
    }
  }
  if (f.threeFingers) {
    return { label: "WATER", kind: "phrase", confidence: 0.86, spoken: PHRASE_SPEECH.WATER };
  }
  if (f.lShape) {
    return { label: "L", kind: "letter", confidence: 0.88, spoken: "L" };
  }
  if (f.point) {
    return {
      label: "DOCTOR",
      kind: "phrase",
      confidence: 0.84,
      spoken: PHRASE_SPEECH.DOCTOR,
    };
  }
  if (f.yShape) {
    return { label: "Y", kind: "letter", confidence: 0.88, spoken: "Y" };
  }
  if (f.openPalm && f.extendedCount >= 4) {
    // Wave-like open palm = HELP / HELLO — prefer HELP for medical app
    return { label: "HELP", kind: "phrase", confidence: 0.92, spoken: PHRASE_SPEECH.HELP };
  }
  if (f.fist && !f.thumbOut) {
    return { label: "PAIN", kind: "phrase", confidence: 0.9, spoken: PHRASE_SPEECH.PAIN };
  }
  if (f.fist && f.thumbOut && !f.thumbUp) {
    return { label: "A", kind: "letter", confidence: 0.82, spoken: "A" };
  }
  if (f.openPalm && !f.thumbOut) {
    return { label: "B", kind: "letter", confidence: 0.8, spoken: "B" };
  }
  if (f.cShape && !f.indexUp) {
    return { label: "C", kind: "letter", confidence: 0.78, spoken: "C" };
  }
  if (!f.indexUp && !f.middleUp && !f.ringUp && f.pinkyUp && !f.thumbOut) {
    return { label: "I", kind: "letter", confidence: 0.85, spoken: "I" };
  }
  if (f.peace) {
    return { label: "V", kind: "letter", confidence: 0.8, spoken: "V" };
  }

  return null;
}

export const FAST_VOCABULARY = [
  { sign: "Open palm", meaning: "HELP", spoken: PHRASE_SPEECH.HELP },
  { sign: "Fist", meaning: "PAIN", spoken: PHRASE_SPEECH.PAIN },
  { sign: "Peace / V", meaning: "CHEST PAIN", spoken: PHRASE_SPEECH["CHEST PAIN"] },
  { sign: "Three fingers", meaning: "WATER", spoken: PHRASE_SPEECH.WATER },
  { sign: "Thumbs up", meaning: "YES", spoken: PHRASE_SPEECH.YES },
  { sign: "Thumbs down", meaning: "NO", spoken: PHRASE_SPEECH.NO },
  { sign: "Point index", meaning: "DOCTOR", spoken: PHRASE_SPEECH.DOCTOR },
  { sign: "OK circle", meaning: "OK", spoken: PHRASE_SPEECH.OK },
];

/** @deprecated */
export const DEMO_VOCABULARY = FAST_VOCABULARY.map((v) => ({
  sign: v.sign,
  meaning: v.meaning,
  kind: "phrase" as const,
}));

export const AI_PHRASE_HINTS = Object.keys(PHRASE_SPEECH).map((k) =>
  k.toLowerCase().replace("_", " ")
);

/** Compact landmark payload for the AI API (normalized). */
export function landmarksForApi(landmarks: Landmark[]) {
  return landmarks.map((p) => ({
    x: Number(p.x.toFixed(3)),
    y: Number(p.y.toFixed(3)),
    z: Number((p.z || 0).toFixed(3)),
  }));
}

export const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
];
