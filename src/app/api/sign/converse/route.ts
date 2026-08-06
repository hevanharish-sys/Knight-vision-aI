import { NextResponse } from "next/server";
import { generateWithGemini, hasGeminiKey, parseDataUrl } from "@/lib/gemini";

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

type ChatTurn = { role: string; text: string };

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
    const handCount = Number(body.handCount || 0);
    const bothHandsLandmarks = body.bothHandsLandmarks as
      | Array<{ label: string; points: Array<{ x: number; y: number; z: number }> }>
      | undefined;
    const localGuess = (body.localGuess as string) || "";
    const history = (body.history as ChatTurn[] | undefined)?.slice(-8) || [];

    if (!image?.startsWith("data:image")) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }

    const historyText = history
      .map((h) => `${h.role}: ${h.text}`)
      .join("\n");

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
            bothHandsLandmarks ? JSON.stringify(bothHandsLandmarks).slice(0, 3500) : "n/a"
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

    // If AI failed but local two-hand/one-hand guess exists, use it
    if (!detected && localGuess) {
      detected = true;
      text = localGuess;
      parsed.notes = `${parsed.notes || ""} Used local both-hands pose.`.trim();
    }

    return NextResponse.json({
      detected,
      text: detected ? text : "",
      isQuestion: Boolean(parsed.isQuestion),
      confidence: Number(parsed.confidence ?? (detected ? 0.7 : 0)),
      notes: String(parsed.notes || ""),
      handsUsed: Number(parsed.handsUsed || handCount || 0),
      language: languageName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Conversation interpret failed";
    const status = message.includes("quota") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
