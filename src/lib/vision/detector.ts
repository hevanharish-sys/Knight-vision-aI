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
  couch: "couch",
  "potted plant": "plant",
  bed: "bed",
  "dining table": "table",
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

function friendlyLabel(raw: string) {
  const key = raw.trim().toLowerCase();
  return FRIENDLY[key] || key.replace(/_/g, " ");
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

function installQuietLogs() {
  if (typeof console === "undefined") return;
  const original = console.error.bind(console);
  // idempotent-ish: wrap once
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
 * Works without Gemini so Vision always sees what's in the camera.
 */
export class VisionSceneDetector {
  private objects: Detector | null = null;
  private faces: Detector | null = null;
  private ready = false;
  private objTs = 0;
  private faceTs = 0;
  private latest: DetectedItem[] = [];

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

    // Official models use .tflite (the old .task float16 URLs 404 now)
    const objectModels = [
      "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
      "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",
      "https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite",
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
            scoreThreshold: 0.25,
            maxResults: 25,
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
            minDetectionConfidence: 0.45,
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
      if (score < 0.28) continue;
      const raw = cat?.categoryName || cat?.displayName || "object";
      const box = d.boundingBox;
      if (!box) continue;
      items.push({
        label: friendlyLabel(raw),
        score,
        kind: "object",
        box: {
          x: (box.originX || 0) / vw,
          y: (box.originY || 0) / vh,
          w: (box.width || 0) / vw,
          h: (box.height || 0) / vh,
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
          const box = d.boundingBox;
          if (!box) continue;
          // Avoid duplicate "person" noise if face already covered by person box
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

    // Sort largest / highest confidence first
    items.sort((a, b) => b.score * b.box.w * b.box.h - a.score * a.box.w * a.box.h);
    this.latest = items;
    return items;
  }

  /** Natural spoken summary of everything currently detected. */
  summarize(items = this.latest): string {
    if (!items.length) {
      return "I don’t see a clear object yet. Slow pan left and right, or move a little closer.";
    }

    const counts = new Map<string, { n: number; best: DetectedItem }>();
    for (const item of items) {
      // Prefer "person" over duplicate "face" for counting people
      const key = item.label === "face" ? "person" : item.label;
      const prev = counts.get(key);
      if (!prev) counts.set(key, { n: 1, best: item });
      else counts.set(key, { n: prev.n + 1, best: item.score > prev.best.score ? item : prev.best });
    }

    const parts: string[] = [];
    const entries = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);

    for (const [label, { n, best }] of entries.slice(0, 10)) {
      const where = positionPhrase(best.box);
      if (n === 1) parts.push(`${label} ${where}`);
      else parts.push(`${n} ${label}${label.endsWith("s") ? "" : "s"} — one is ${where}`);
    }

    const hazards = entries.filter(([l]) =>
      ["car", "bus", "truck", "motorcycle", "bicycle", "traffic light", "stop sign"].includes(l)
    );
    const lead =
      hazards.length > 0
        ? "Watch for traffic nearby. "
        : entries.some(([l]) => l === "person")
          ? "People are in view. "
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
  }
}

export function drawDetections(
  ctx: CanvasRenderingContext2D,
  items: DetectedItem[],
  mirrored = false
) {
  const { width: w, height: h } = ctx.canvas;
  // Keep overlay fully transparent so the live camera never looks black
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";

  for (const item of items) {
    let x = item.box.x * w;
    const y = item.box.y * h;
    const bw = item.box.w * w;
    const bh = item.box.h * h;
    if (mirrored) x = w - x - bw;

    const color = item.kind === "face" ? "#19b5b8" : "#e8ff6a";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, bw, bh);

    const tag = `${item.label} ${Math.round(item.score * 100)}%`;
    ctx.font = "bold 14px Figtree, system-ui, sans-serif";
    const tw = ctx.measureText(tag).width + 12;
    ctx.fillStyle = "rgba(11,31,51,0.88)";
    ctx.fillRect(x, Math.max(0, y - 24), tw, 24);
    ctx.fillStyle = color;
    ctx.fillText(tag, x + 6, Math.max(16, y - 7));
  }
}
