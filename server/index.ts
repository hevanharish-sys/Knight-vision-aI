import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import express from "express";
import multer from "multer";
import {
  generateWithGemini,
  hasGeminiKey,
  isGeminiCoolingDown,
  parseDataUrl,
  tryGenerateWithGemini,
} from "./lib/gemini";
import { fallbackTranslate } from "./lib/offline-translate";
import { PHRASE_SPEECH } from "./lib/phrases";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, "../.env.local") });

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const PORT = Number(process.env.PORT || 4000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

app.use(
  cors({
    origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN.split(",").map((s) => s.trim()),
  })
);
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "knight-vision-api",
    gemini: hasGeminiKey(),
  });
});

function extractJson(raw: string) {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Could not parse model JSON");
  }
}

app.post("/api/translate", async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body || {};
    if (!text || !targetLang) {
      return res.status(400).json({ error: "text and targetLang required" });
    }

    let translation: string | null = null;
    let source: "gemini" | "fallback" = "gemini";

    if (hasGeminiKey() && !isGeminiCoolingDown()) {
      translation = await tryGenerateWithGemini({
        systemInstruction:
          "You are Knight Vision Live Translator. Translate accurately for hospitals and public services. Return only the translated text, no quotes or notes.",
        parts: [
          {
            text: `Translate from ${sourceLang || "auto-detect"} to ${targetLang}:\n\n${text}`,
          },
        ],
      });
    }

    if (!translation) {
      translation = await fallbackTranslate({
        text,
        sourceLang: sourceLang || "English",
        targetLang,
      });
      source = "fallback";
    }

    if (!translation) {
      return res.status(503).json({
        error:
          "Translation is briefly unavailable. Please try again in about 20 seconds.",
        soft: true,
      });
    }

    return res.json({
      translation,
      source,
      notice:
        source === "fallback"
          ? "Used backup translator while cloud AI cools down."
          : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Translation failed";
    return res.status(500).json({ error: message, soft: true });
  }
});

app.post("/api/speech/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!hasGeminiKey()) {
      return res.status(503).json({
        error: "GEMINI_API_KEY is not configured on the API server.",
      });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "audio file required" });
    }

    const mimeType = file.mimetype || "application/octet-stream";
    const data = file.buffer.toString("base64");
    const text = await generateWithGemini({
      systemInstruction:
        "You are a speech transcription engine. Transcribe the audio accurately. Return only the transcript text, no quotes or commentary.",
      parts: [
        { text: "Transcribe this audio." },
        { inlineData: { mimeType, data } },
      ],
    });

    return res.json({ text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Transcription failed";
    const status = message.includes("quota") ? 429 : 500;
    return res.status(status).json({ error: message });
  }
});

app.post("/api/vision/describe", async (req, res) => {
  try {
    const image = req.body?.image as string | undefined;
    const detectorSummary = (req.body?.detectorSummary as string) || "";

    if (!image?.startsWith("data:image")) {
      return res.status(400).json({
        ok: false,
        description: null,
        source: "none",
        error: "image required",
      });
    }

    if (!hasGeminiKey()) {
      return res.json({
        ok: false,
        description: null,
        source: "none",
        error: "missing_key",
      });
    }

    if (isGeminiCoolingDown()) {
      return res.json({
        ok: false,
        description: null,
        source: "cooldown",
        error: null,
      });
    }

    const { mimeType, data } = parseDataUrl(image);
    const raw = await tryGenerateWithGemini({
      systemInstruction: `You are the Knight Vision AI scene assistant for people who are blind or have low vision.
Look carefully at the image. Be precise — only name objects you clearly see.
Priority items: headphones, earbuds, microphone/mic, watch/wristwatch, ID card/badge, table/desk, chair, sofa, laptop, phone, keyboard, bottle, cup, glasses, bag, keys, door, stairs, people.
Describe the scene in 2-4 short spoken sentences with left/right/near when useful.
Also list every clear object you see (short lowercase names).
Return ONLY valid JSON with keys:
- description (string, spoken sentences)
- objects (array of short lowercase names, e.g. "headphones", "chair", "id card", "table", "microphone", "watch")
No markdown. Never refuse. Do not invent objects that are not visible.`,
      parts: [
        {
          text: `On-device detections: ${detectorSummary || "none"}.
Name headphones, mic, watch, ID card, table, chair and other visible items if present. JSON only.`,
        },
        { inlineData: { mimeType, data } },
      ],
    });

    if (!raw) {
      return res.json({
        ok: false,
        description: null,
        objects: [],
        source: "quota",
        error: null,
      });
    }

    let description = raw;
    let objects: string[] = [];
    try {
      const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned) as {
        description?: string;
        objects?: unknown;
      };
      description = String(parsed.description || cleaned).trim();
      objects = Array.isArray(parsed.objects)
        ? parsed.objects
            .map((o) => String(o).trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 20)
        : [];
    } catch {
      description = raw.slice(0, 600);
    }

    return res.json({
      ok: true,
      description,
      objects,
      source: "gemini",
      error: null,
    });
  } catch {
    return res.json({
      ok: false,
      description: null,
      objects: [],
      source: "error",
      error: null,
    });
  }
});

app.post("/api/document/analyze", async (req, res) => {
  try {
    const image = req.body?.image as string | undefined;
    const language = (req.body?.language as string) || "English";

    if (!image?.startsWith("data:image")) {
      return res.status(400).json({ error: "image data URL required" });
    }

    if (!hasGeminiKey()) {
      return res.json({
        originalText: "",
        simpleExplanation: "",
        deadlineHint: "",
        soft: true,
        fallback: true,
        source: "no-key",
        error: "Document cloud reading needs GEMINI_API_KEY.",
      });
    }

    if (isGeminiCoolingDown()) {
      return res.json({
        originalText: "",
        simpleExplanation: "",
        deadlineHint: "",
        soft: true,
        fallback: true,
        source: "cooldown",
        error: "Cloud AI is briefly resting after heavy use.",
      });
    }

    const { mimeType, data } = parseDataUrl(image);
    const raw = await tryGenerateWithGemini({
      systemInstruction: `You are Knight Vision Smart Document Reader.
OCR the document, then explain it in plain ${language} for someone with limited literacy.
Return ONLY valid JSON with keys: originalText, simpleExplanation, deadlineHint.
deadlineHint should convert relative deadlines into a concrete suggestion when possible.`,
      parts: [
        {
          text: "Read this prescription, notice, bill, or form and simplify it. JSON only.",
        },
        { inlineData: { mimeType, data } },
      ],
    });

    if (!raw) {
      return res.json({
        originalText: "",
        simpleExplanation: "",
        deadlineHint: "",
        soft: true,
        fallback: true,
        source: "quota",
        error: "Cloud AI quota is busy right now.",
      });
    }

    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed: {
      originalText?: string;
      simpleExplanation?: string;
      deadlineHint?: string;
    } = {};
    try {
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      parsed = {
        originalText: "",
        simpleExplanation: cleaned.slice(0, 800),
        deadlineHint: "",
      };
    }

    return res.json({
      originalText: parsed.originalText || "",
      simpleExplanation:
        parsed.simpleExplanation || "Could not simplify this document.",
      deadlineHint: parsed.deadlineHint || "",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Document analysis failed";
    return res.json({
      originalText: "",
      simpleExplanation:
        "Something went wrong reading the document. Please try again shortly.",
      deadlineHint: "",
      soft: true,
      error: message,
    });
  }
});

app.post("/api/sign/converse", async (req, res) => {
  try {
    if (!hasGeminiKey()) {
      return res.status(503).json({
        error: "GEMINI_API_KEY is not configured on the API server.",
      });
    }

    const body = req.body || {};
    const image = body.image as string | undefined;
    const languageName = (body.languageName as string) || "Indian Sign Language";
    const featuresSummary = (body.featuresSummary as string) || "";
    const handCount = Number(body.handCount || 0);
    const bothHandsLandmarks = body.bothHandsLandmarks as
      | Array<{ label: string; points: Array<{ x: number; y: number; z: number }> }>
      | undefined;
    const localGuess = (body.localGuess as string) || "";
    const history =
      (body.history as Array<{ role: string; text: string }> | undefined)?.slice(
        -8
      ) || [];

    if (!image?.startsWith("data:image")) {
      return res.status(400).json({ error: "image required" });
    }

    const historyText = history.map((h) => `${h.role}: ${h.text}`).join("\n");
    const { mimeType, data } = parseDataUrl(image);

    const raw = await generateWithGemini({
      systemInstruction: `You are Knight Vision Live Sign Interpreter for doctor–patient talk.
The patient signs in ${languageName} using ONE OR BOTH hands (two-handed signs are common and important).

Rules:
- ALWAYS consider both hands if present (handCount tells you how many skeletons were tracked).
- Translate free-form signing: words, sentences, questions, fingerspelling, medical complaints.
- Do NOT limit answers to a tiny keyword list.
- Use conversation history for context.
- If localGuess is given, confirm or improve it into a natural sentence.
- Output clear spoken English for the doctor.
- If hands are visible, prefer detected=true with your best reading.

Return ONLY JSON:
{"detected":true,"text":"natural English for the doctor","isQuestion":false,"confidence":0.8,"notes":"","handsUsed":1|2}`,
      parts: [
        {
          text: `Interpret this ${languageName} sign (two-hand capable).
Tracked hands: ${handCount}.
Skeleton features: ${featuresSummary || "n/a"}.
Local pose guess: ${localGuess || "none"}.
Both-hand landmarks: ${
            bothHandsLandmarks
              ? JSON.stringify(bothHandsLandmarks).slice(0, 3500)
              : "n/a"
          }
Recent conversation:
${historyText || "(start)"}

JSON only.`,
        },
        { inlineData: { mimeType, data } },
      ],
    });

    let parsed: {
      detected?: boolean;
      text?: string;
      isQuestion?: boolean;
      confidence?: number;
      notes?: string;
      handsUsed?: number;
    };

    try {
      parsed = extractJson(raw || "{}") as typeof parsed;
    } catch {
      const plain = (raw || "").trim();
      parsed = plain
        ? {
            detected: true,
            text: plain.slice(0, 300),
            confidence: 0.55,
            notes: "plain fallback",
            handsUsed: handCount,
          }
        : { detected: false, text: "", notes: "empty" };
    }

    let text = String(parsed.text || "").trim();
    let detected = Boolean(parsed.detected && text);

    if (!detected && localGuess) {
      detected = true;
      text = localGuess;
      parsed.notes = `${parsed.notes || ""} Used local both-hands pose.`.trim();
    }

    return res.json({
      detected,
      text: detected ? text : "",
      isQuestion: Boolean(parsed.isQuestion),
      confidence: Number(parsed.confidence ?? (detected ? 0.7 : 0)),
      notes: String(parsed.notes || ""),
      handsUsed: Number(parsed.handsUsed || handCount || 0),
      language: languageName,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Conversation interpret failed";
    const status = message.includes("quota") ? 429 : 500;
    return res.status(status).json({ error: message });
  }
});

app.post("/api/sign/interpret", async (req, res) => {
  try {
    if (!hasGeminiKey()) {
      return res.status(503).json({
        error: "GEMINI_API_KEY is not configured on the API server.",
      });
    }

    const body = req.body || {};
    const image = body.image as string | undefined;
    const languageName = (body.languageName as string) || "Indian Sign Language";
    const featuresSummary = (body.featuresSummary as string) || "";
    const localGuess = (body.localGuess as string) || "";
    const landmarks = body.landmarks as
      | Array<{ x: number; y: number; z: number }>
      | undefined;

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [
      {
        text: `Interpret this sign language frame for ${languageName}.
Hand sensor features: ${featuresSummary || "none"}.
Local pose guess: ${localGuess || "none"}.
Landmark count: ${landmarks?.length || 0}.
${landmarks?.length ? `Landmarks JSON: ${JSON.stringify(landmarks)}` : ""}

Return ONLY JSON:
{"detected":true,"kind":"phrase","label":"HELP","text":"I need help.","confidence":0.85,"notes":""}

Allowed labels (prefer these): ${Object.keys(PHRASE_SPEECH).join(", ")}
"text" must be a full spoken English sentence when kind is phrase.
If local pose guess is provided and matches the image/features, confirm it.
If a hand is present, ALWAYS return detected=true with your best meaning — do not refuse.`,
      },
    ];

    if (image?.startsWith("data:image")) {
      const { mimeType, data } = parseDataUrl(image);
      parts.push({ inlineData: { mimeType, data } });
    } else if (!landmarks?.length && !featuresSummary) {
      return res
        .status(400)
        .json({ error: "image or hand landmarks required" });
    }

    const raw = await generateWithGemini({
      systemInstruction: `You are Knight Vision Sign Detector. Convert hand signs into clear English speech for hospitals.
Never return empty text when a hand is visible. Prefer medical/emergency meanings.
Known mappings: open palm=HELP, fist=PAIN, thumbs up=YES, thumbs down=NO, peace=CHEST PAIN, 3 fingers=WATER, point=DOCTOR, OK circle=OK.`,
      parts,
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = extractJson(raw || "{}");
    } catch {
      if (localGuess && PHRASE_SPEECH[localGuess]) {
        return res.json({
          detected: true,
          kind: "phrase",
          label: localGuess,
          text: PHRASE_SPEECH[localGuess],
          confidence: 0.7,
          notes: "Used local pose because AI text parse failed",
          language: languageName,
        });
      }
      parsed = {
        detected: true,
        kind: "phrase",
        label: "SIGN",
        text: (raw || "Sign detected.").slice(0, 200),
        confidence: 0.5,
      };
    }

    let label = String(parsed.label || localGuess || "").toUpperCase();
    let text = String(parsed.text || "").trim();
    let detected = parsed.detected !== false;

    if (!text && localGuess && PHRASE_SPEECH[localGuess]) {
      label = localGuess;
      text = PHRASE_SPEECH[localGuess];
      detected = true;
    }

    const key = (label || text || "").toUpperCase().trim();
    if (PHRASE_SPEECH[key]) {
      label = key;
      text = PHRASE_SPEECH[key];
    }

    if (!text) detected = false;

    return res.json({
      detected,
      kind: parsed.kind === "letter" ? "letter" : "phrase",
      label,
      text: detected ? text : "",
      confidence: Number(parsed.confidence ?? 0.75),
      notes: String(parsed.notes || ""),
      language: languageName,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sign interpretation failed";
    const status = message.includes("quota") ? 429 : 500;
    return res.status(status).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`[knight-vision-api] listening on :${PORT}`);
  console.log(`[knight-vision-api] gemini key: ${hasGeminiKey() ? "yes" : "missing"}`);
});
