import { NextResponse } from "next/server";
import { generateWithGemini, hasGeminiKey, parseDataUrl } from "@/lib/gemini";
import { PHRASE_SPEECH } from "@/lib/sign/gestures";

export const runtime = "nodejs";

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

function expandLabel(label: string, text: string) {
  const key = (label || text || "").toUpperCase().trim();
  if (PHRASE_SPEECH[key]) return { label: key, text: PHRASE_SPEECH[key] };
  return { label: key || "SIGN", text: text || label };
}

export async function POST(request: Request) {
  try {
    if (!hasGeminiKey()) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured. Add it to .env.local" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const image = body.image as string | undefined;
    const languageName = (body.languageName as string) || "Indian Sign Language";
    const featuresSummary = (body.featuresSummary as string) || "";
    const localGuess = (body.localGuess as string) || "";
    const landmarks = body.landmarks as Array<{ x: number; y: number; z: number }> | undefined;

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
      return NextResponse.json(
        { error: "image or hand landmarks required" },
        { status: 400 }
      );
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
        return NextResponse.json({
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

    const expanded = expandLabel(label, text);
    label = expanded.label;
    text = expanded.text;

    if (!text) {
      detected = false;
    }

    return NextResponse.json({
      detected,
      kind: parsed.kind === "letter" ? "letter" : "phrase",
      label,
      text: detected ? text : "",
      confidence: Number(parsed.confidence ?? 0.75),
      notes: String(parsed.notes || ""),
      language: languageName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign interpretation failed";
    const status = message.includes("quota") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
