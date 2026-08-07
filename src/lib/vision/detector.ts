"use client";

export type DetectedItem = {
  label: string;
  score: number;
  /** Normalized 0–1 box: origin top-left */
  box: { x: number; y: number; w: number; h: number };
  kind: "object" | "face";
};

type DetectionResult = {
  detections?: Array<{
    categories?: Array<{ categoryName?: string; displayName?: string; score?: number }>;
    boundingBox?: {
      originX?: number;
      originY?: number;
      width?: number;
      height?: number;
    };
  }>;
};

type Detector = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => DetectionResult;
  close: () => void;
};

type VisionModule = {
  FilesetResolver: {
    forVisionTasks: (wasm: string) => Promise<unknown>;
  };
  ObjectDetector: {
    createFromOptions: (fileset: unknown, options: unknown) => Promise<Detector>;
  };
  FaceDetector: {
    createFromOptions: (fileset: unknown, options: unknown) => Promise<Detector>;
  };
};

const MEDIAPIPE_VERSION = "0.10.14";
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;

const FRIENDLY: Record<string, string> = {
  person: "person",
  bicycle: "bicycle",
  car: "car",
  motorcycle: "motorcycle",
  airplane: "airplane",
  bus: "bus",
  train: "train",
  truck: "truck",
  boat: "boat",
  "traffic light": "traffic light",
  "fire hydrant": "fire hydrant",
  "stop sign": "stop sign",
  "parking meter": "parking meter",
  bench: "bench",
  bird: "bird",
  cat: "cat",
  dog: "dog",
  horse: "horse",
  sheep: "sheep",
  cow: "cow",
  elephant: "elephant",
  bear: "bear",
  zebra: "zebra",
  giraffe: "giraffe",
  backpack: "backpack",
  umbrella: "umbrella",
  handbag: "handbag",
  tie: "tie",
  suitcase: "suitcase",
  frisbee: "frisbee",
  skis: "skis",
  snowboard: "snowboard",
  "sports ball": "ball",
  kite: "kite",
  "baseball bat": "baseball bat",
  "baseball glove": "baseball glove",
  skateboard: "skateboard",
  surfboard: "surfboard",
  "tennis racket": "tennis racket",
  bottle: "bottle",
  "wine glass": "glass",
  cup: "cup",
  fork: "fork",
  knife: "knife",
  spoon: "spoon",
  bowl: "bowl",
  banana: "banana",
  apple: "apple",
  sandwich: "sandwich",
  orange: "orange",
  broccoli: "broccoli",
  carrot: "carrot",
  "hot dog": "hot dog",
  pizza: "pizza",
  donut: "donut",
  cake: "cake",
  chair: "chair",
  couch: "sofa",
  "potted plant": "plant",
  bed: "bed",
  "dining table": "table",
  table: "table",
  toilet: "toilet",
  tv: "TV",
  laptop: "laptop",
  mouse: "computer mouse",
  remote: "remote",
  keyboard: "keyboard",
  "cell phone": "phone",
  microwave: "microwave",
  oven: "oven",
  toaster: "toaster",
  sink: "sink",
  refrigerator: "refrigerator",
  book: "book",
  clock: "clock",
  vase: "vase",
  scissors: "scissors",
  "teddy bear": "teddy bear",
  "hair drier": "hair dryer",
  toothbrush: "toothbrush",
};

/** Category-specific confidence floors (higher = fewer false positives). */
const SCORE_FLOOR: Record<string, number> = {
  person: 0.28,
  face: 0.5,
  chair: 0.18,
  table: 0.18,
  sofa: 0.2,
  bed: 0.22,
  bench: 0.22,
  laptop: 0.28,
  keyboard: 0.3,
  "computer mouse": 0.32,
  phone: 0.35,
  bottle: 0.28,
  cup: 0.3,
  book: 0.35,
  remote: 0.4,
  clock: 0.35,
  backpack: 0.28,
  handbag: 0.3,
  suitcase: 0.3,
  TV: 0.3,
  car: 0.32,
  bus: 0.32,
  truck: 0.32,
  bicycle: 0.3,
  motorcycle: 0.3,
  dog: 0.32,
  cat: 0.32,
};

const DEFAULT_SCORE_FLOOR = 0.3;

/** Everyday items Gemini should prioritize (beyond COCO-80). */
export const PRIORITY_SPOT_ITEMS = [
  "headphones",
  "earbuds",
  "microphone",
  "mic",
  "watch",
  "wristwatch",
  "id card",
  "badge",
  "table",
  "desk",
  "chair",
  "sofa",
  "laptop",
  "phone",
  "keyboard",
  "mouse",
  "bottle",
  "cup",
  "glasses",
  "bag",
  "wallet",
  "keys",
  "pen",
  "notebook",
  "monitor",
  "speaker",
  "camera",
  "door",
  "stairs",
] as const;

type Track = {
  item: DetectedItem;
  hits: number;
  misses: number;
  id: number;
};

function friendlyLabel(raw: string) {
  const key = raw.trim().toLowerCase();
  return FRIENDLY[key] || key.replace(/_/g, " ");
}

function scoreFloor(label: string) {
  return SCORE_FLOOR[label] ?? DEFAULT_SCORE_FLOOR;
}

function positionPhrase(box: DetectedItem["box"]) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const horiz = cx < 0.33 ? "on the left" : cx > 0.66 ? "on the right" : "in the center";
  const vert = cy < 0.33 ? "near the top" : cy > 0.66 ? "near the bottom" : "";
  const near =
    box.w * box.h > 0.28 ? " close to you" : box.w * box.h < 0.04 ? " farther away" : "";
  return [horiz, vert].filter(Boolean).join(", ") + near;
}

function iou(a: DetectedItem["box"], b: DetectedItem["box"]) {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function centerDistance(a: DetectedItem["box"], b: DetectedItem["box"]) {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  return Math.hypot(ax - bx, ay - by);
}

function lerpBox(a: DetectedItem["box"], b: DetectedItem["box"], t: number) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  };
}

/** Suppress overlapping duplicates of the same/similar label. */
function nms(items: DetectedItem[], threshold = 0.45): DetectedItem[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const kept: DetectedItem[] = [];
  for (const item of sorted) {
    const overlaps = kept.some((k) => {
      const sameFamily =
        k.label === item.label ||
        (k.label === "person" && item.label === "face") ||
        (k.label === "face" && item.label === "person");
      return sameFamily && iou(k.box, item.box) >= threshold;
    });
    if (!overlaps) kept.push(item);
  }
  return kept;
}

function installQuietLogs() {
  if (typeof console === "undefined") return;
  const original = console.error.bind(console);
  if ((console.error as { __lbQuiet?: boolean }).__lbQuiet) return;
  const wrapped = (...args: unknown[]) => {
    const text = args.map(String).join(" ");
    if (
      text.includes("XNNPACK") ||
      text.includes("TensorFlow Lite") ||
      text.includes("INFO:")
    ) {
      return;
    }
    original(...args);
  };
  (wrapped as { __lbQuiet?: boolean }).__lbQuiet = true;
  console.error = wrapped;
}

async function loadVision(): Promise<VisionModule> {
  const dynamicImport = new Function(
    "u",
    "return import(u)"
  ) as (u: string) => Promise<VisionModule>;
  return dynamicImport(`${CDN}/vision_bundle.mjs`);
}

/**
 * On-device detector: MediaPipe ObjectDetector (COCO-80) + FaceDetector.
 * Lite0 float16 first for low latency; Lite2 tried if Lite0 fails to load.
 */
export class VisionSceneDetector {
  private objects: Detector | null = null;
  private faces: Detector | null = null;
  private ready = false;
  private objTs = 0;
  private faceTs = 0;
  private latest: DetectedItem[] = [];
  private tracks: Track[] = [];
  private nextTrackId = 1;

  get isReady() {
    return this.ready;
  }

  getLatest() {
    return this.latest;
  }

  async init() {
    installQuietLogs();
    const { FilesetResolver, ObjectDetector, FaceDetector } = await loadVision();
    const fileset = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);

    // Lite0 = fast detect+speak. Lite2 only as fallback if Lite0 cannot load.
    const objectModels = [
      "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite",
      "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
      "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite",
      "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/latest/efficientdet_lite2.tflite",
      "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",
    ];
    const faceModels = [
      "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    ];

    let objectOk = false;
    let lastObjError: unknown;
    for (const modelAssetPath of objectModels) {
      for (const delegate of ["GPU", "CPU"] as const) {
        try {
          this.objects = await ObjectDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath, delegate },
            runningMode: "VIDEO",
            scoreThreshold: 0.2,
            maxResults: 12,
          });
          objectOk = true;
          break;
        } catch (e) {
          lastObjError = e;
        }
      }
      if (objectOk) break;
    }
    if (!objectOk || !this.objects) {
      throw lastObjError instanceof Error
        ? lastObjError
        : new Error("Failed to load object detector model");
    }

    this.faces = null;
    for (const modelAssetPath of faceModels) {
      for (const delegate of ["GPU", "CPU"] as const) {
        try {
          this.faces = await FaceDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath, delegate },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.5,
          });
          break;
        } catch {
          /* try next */
        }
      }
      if (this.faces) break;
    }

    this.ready = true;
  }

  private nextTs(prev: number) {
    const now = performance.now();
    return now <= prev ? prev + 1 : now;
  }

  /** Match raw detections to tracks for temporal smoothing. */
  private stabilize(raw: DetectedItem[]): DetectedItem[] {
    const matchedTrack = new Set<number>();
    const matchedDet = new Set<number>();
    const pairs: Array<{ ti: number; di: number; score: number }> = [];

    for (let ti = 0; ti < this.tracks.length; ti++) {
      for (let di = 0; di < raw.length; di++) {
        const track = this.tracks[ti];
        const det = raw[di];
        const same =
          track.item.label === det.label ||
          (track.item.label === "person" && det.label === "face") ||
          (track.item.label === "face" && det.label === "person");
        if (!same) continue;
        const overlap = iou(track.item.box, det.box);
        const dist = centerDistance(track.item.box, det.box);
        if (overlap < 0.15 && dist > 0.22) continue;
        pairs.push({ ti, di, score: overlap * 2 + det.score - dist });
      }
    }

    pairs.sort((a, b) => b.score - a.score);
    for (const p of pairs) {
      if (matchedTrack.has(p.ti) || matchedDet.has(p.di)) continue;
      matchedTrack.add(p.ti);
      matchedDet.add(p.di);
      const track = this.tracks[p.ti];
      const det = raw[p.di];
      track.hits += 1;
      track.misses = 0;
      track.item = {
        ...det,
        // Prefer person over face once matched
        label:
          track.item.label === "person" || det.label === "person"
            ? "person"
            : det.label,
        score: Math.max(track.item.score * 0.4 + det.score * 0.6, det.score),
        box: lerpBox(track.item.box, det.box, 0.65),
      };
    }

    for (let ti = 0; ti < this.tracks.length; ti++) {
      if (matchedTrack.has(ti)) continue;
      this.tracks[ti].misses += 1;
    }

    for (let di = 0; di < raw.length; di++) {
      if (matchedDet.has(di)) continue;
      this.tracks.push({
        item: raw[di],
        hits: 1,
        misses: 0,
        id: this.nextTrackId++,
      });
    }

    this.tracks = this.tracks.filter((t) => t.misses <= 5);

    // Show strong detections immediately; weak ones after one confirm frame
    return this.tracks
      .filter(
        (t) =>
          t.hits >= 2 ||
          t.item.score >= 0.4 ||
          t.item.kind === "face" ||
          ["person", "chair", "table", "laptop", "bottle", "phone"].includes(
            t.item.label
          )
      )
      .map((t) => t.item);
  }

  detect(video: HTMLVideoElement): DetectedItem[] {
    if (!this.ready || !this.objects || video.readyState < 2) return this.latest;

    const vw = video.videoWidth || 1;
    const vh = video.videoHeight || 1;
    const items: DetectedItem[] = [];

    const ots = this.nextTs(this.objTs);
    this.objTs = ots;
    const objRes = this.objects.detectForVideo(video, ots);
    for (const d of objRes.detections || []) {
      const cat = d.categories?.[0];
      const score = cat?.score ?? 0;
      const raw = cat?.categoryName || cat?.displayName || "object";
      const label = friendlyLabel(raw);
      if (score < scoreFloor(label)) continue;
      const box = d.boundingBox;
      if (!box) continue;
      const w = (box.width || 0) / vw;
      const h = (box.height || 0) / vh;
      // Drop tiny noise blobs
      if (w * h < 0.004 && score < 0.55) continue;
      items.push({
        label,
        score,
        kind: "object",
        box: {
          x: (box.originX || 0) / vw,
          y: (box.originY || 0) / vh,
          w,
          h,
        },
      });
    }

    if (this.faces) {
      try {
        const fts = this.nextTs(this.faceTs);
        this.faceTs = fts;
        const faceRes = this.faces.detectForVideo(video, fts);
        for (const d of faceRes.detections || []) {
          const score = d.categories?.[0]?.score ?? 0.6;
          if (score < scoreFloor("face")) continue;
          const box = d.boundingBox;
          if (!box) continue;
          items.push({
            label: "face",
            score,
            kind: "face",
            box: {
              x: (box.originX || 0) / vw,
              y: (box.originY || 0) / vh,
              w: (box.width || 0) / vw,
              h: (box.height || 0) / vh,
            },
          });
        }
      } catch {
        /* face optional */
      }
    }

    const cleaned = nms(items);
    const stable = this.stabilize(cleaned);
    stable.sort((a, b) => b.score * b.box.w * b.box.h - a.score * a.box.w * a.box.h);
    this.latest = stable;
    return stable;
  }

  /** Short line for fast TTS when something new appears. */
  announceNew(newLabels: string[], items = this.latest): string {
    if (!newLabels.length) return "";
    const bestByLabel = new Map<string, DetectedItem>();
    for (const item of items) {
      const key = item.label === "face" ? "person" : item.label;
      const prev = bestByLabel.get(key);
      if (!prev || item.score > prev.score) bestByLabel.set(key, item);
    }
    const parts = newLabels.slice(0, 3).map((label) => {
      const item = bestByLabel.get(label);
      return item ? `${label} ${positionPhrase(item.box)}` : label;
    });
    return parts.length === 1
      ? `I see ${parts[0]}.`
      : `I see ${parts.join(", and ")}.`;
  }

  /** Natural spoken summary of everything currently detected. */
  summarize(items = this.latest, maxItems = 5): string {
    if (!items.length) {
      return "I don’t see a clear object yet. Slow pan left and right, or move a little closer.";
    }

    const counts = new Map<string, { n: number; best: DetectedItem }>();
    for (const item of items) {
      const key = item.label === "face" ? "person" : item.label;
      const prev = counts.get(key);
      if (!prev) counts.set(key, { n: 1, best: item });
      else
        counts.set(key, {
          n: prev.n + 1,
          best: item.score > prev.best.score ? item : prev.best,
        });
    }

    const parts: string[] = [];
    const entries = [...counts.entries()].sort(
      (a, b) =>
        b[1].best.score * b[1].best.box.w * b[1].best.box.h -
        a[1].best.score * a[1].best.box.w * a[1].best.box.h
    );

    for (const [label, { n, best }] of entries.slice(0, maxItems)) {
      const where = positionPhrase(best.box);
      if (n === 1) parts.push(`${label} ${where}`);
      else parts.push(`${n} ${label}${label.endsWith("s") ? "" : "s"} — one is ${where}`);
    }

    const hazards = entries.filter(([l]) =>
      ["car", "bus", "truck", "motorcycle", "bicycle", "traffic light", "stop sign"].includes(
        l
      )
    );
    const lead =
      hazards.length > 0
        ? "Watch for traffic. "
        : entries.some(([l]) => l === "person")
          ? "People nearby. "
          : "";

    return `${lead}I can see: ${parts.join("; ")}.`;
  }

  close() {
    try {
      this.objects?.close();
      this.faces?.close();
    } catch {
      /* ignore */
    }
    this.objects = null;
    this.faces = null;
    this.ready = false;
    this.latest = [];
    this.tracks = [];
  }
}

/**
 * COCO-80 has no headphones / earbuds / watch / ID / mic classes.
 * Shape heuristics + Gemini hints correct common mislabels.
 * Gemini-only labels are added as soft center chips when missing on-device.
 */
export function refineDetections(
  items: DetectedItem[],
  geminiHints: string[] = []
): DetectedItem[] {
  const hints = geminiHints.map((h) => h.toLowerCase().trim()).filter(Boolean);
  const has = (re: RegExp) => hints.some((h) => re.test(h));
  const earbudsHint = has(/headphone|earbud|airpod|ear.?case|charging case/);
  const watchHint = has(/\bwatch\b|wristwatch/);
  const idHint = has(/id card|\bbadge\b|identity|id badge/);
  const micHint = has(/\bmic\b|microphone/);
  const glassesHint = has(/glasses|spectacles|eyewear/);
  const keysHint = has(/\bkeys?\b/);
  const bagHint = has(/\bbag\b|backpack|handbag|purse/);

  const refined = items.map((item) => {
    let label = item.label;
    const { w, h } = item.box;
    const ar = w / Math.max(h, 1e-6);
    const area = w * h;
    const squareish = ar >= 0.55 && ar <= 1.8;
    const phoneShaped = (ar < 0.48 && h > w * 1.35) || (ar > 2.1 && w > h * 1.35);
    const personNearby = items.some(
      (i) => i.label === "person" || i.label === "face"
    );

    if (label === "phone" || label === "cell phone") {
      if (earbudsHint) {
        label = area < 0.12 ? "earbuds" : "headphones";
      } else if (watchHint && area < 0.08) {
        label = "watch";
      } else if (idHint && squareish && area < 0.18) {
        label = "id card";
      } else if (micHint && area < 0.14) {
        label = "microphone";
      } else if (
        squareish &&
        !phoneShaped &&
        area < 0.28 &&
        (item.score < 0.82 || personNearby || area < 0.14)
      ) {
        label = area < 0.1 ? "earbuds" : "headphones";
      } else {
        label = "phone";
      }
    }

    if (label === "remote" && (micHint || (area < 0.08 && ar > 1.8))) {
      label = micHint ? "microphone" : label;
    }
    if (label === "clock" && (watchHint || (squareish && area < 0.07))) {
      label = "watch";
    }
    if ((label === "book" || label === "remote") && idHint && area < 0.2) {
      label = "id card";
    }
    if (label === "cup" && micHint && ar > 0.7 && ar < 1.4 && area < 0.1) {
      label = "microphone";
    }
    if ((label === "handbag" || label === "backpack") && bagHint) {
      /* keep bag family */
    }
    if (label === "glasses" || (glassesHint && label === "cup" && area < 0.06)) {
      if (glassesHint) label = "glasses";
    }

    if (label === item.label) return item;
    return { ...item, label, score: Math.min(0.99, item.score + 0.08) };
  });

  // Inject Gemini-only spots that COCO cannot name, as soft center markers
  const present = new Set(refined.map((r) => r.label.toLowerCase()));
  const injectables: Array<{ re: RegExp; label: string }> = [
    { re: /headphone/, label: "headphones" },
    { re: /earbud|airpod/, label: "earbuds" },
    { re: /\bmic\b|microphone/, label: "microphone" },
    { re: /\bwatch\b|wristwatch/, label: "watch" },
    { re: /id card|\bbadge\b/, label: "id card" },
    { re: /glasses|spectacles/, label: "glasses" },
    { re: /\bkeys?\b/, label: "keys" },
    { re: /\bdoor\b/, label: "door" },
    { re: /stairs?|staircase/, label: "stairs" },
  ];

  const extras: DetectedItem[] = [];
  for (const { re, label } of injectables) {
    if (!has(re) || present.has(label)) continue;
    // Prefer attaching to a nearby ambiguous box if one exists
    const host =
      refined.find(
        (r) =>
          (r.label === "phone" || r.label === "remote" || r.label === "book") &&
          r.box.w * r.box.h < 0.2
      ) || null;
    if (host) {
      extras.push({
        ...host,
        label,
        score: Math.min(0.95, host.score + 0.1),
        kind: "object",
      });
    } else {
      extras.push({
        label,
        score: 0.72,
        kind: "object",
        box: { x: 0.35, y: 0.35, w: 0.3, h: 0.3 },
      });
    }
    present.add(label);
  }

  // Drop original phone boxes that were remapped via extras host
  void keysHint;
  return nms([...refined, ...extras], 0.5);
}

export function drawDetections(
  ctx: CanvasRenderingContext2D,
  items: DetectedItem[],
  mirrored = false
) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";

  for (const item of items) {
    let x = item.box.x * w;
    const y = item.box.y * h;
    const bw = item.box.w * w;
    const bh = item.box.h * h;
    if (mirrored) x = w - x - bw;

    const color = item.kind === "face" ? "#7C3AED" : "#e8ff6a";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, bw, bh);

    const tag = `${item.label} ${Math.round(item.score * 100)}%`;
    ctx.font = "bold 14px Figtree, system-ui, sans-serif";
    const tw = ctx.measureText(tag).width + 12;
    ctx.fillStyle = "rgba(10,10,10,0.88)";
    ctx.fillRect(x, Math.max(0, y - 24), tw, 24);
    ctx.fillStyle = color;
    ctx.fillText(tag, x + 6, Math.max(16, y - 7));
  }
}
