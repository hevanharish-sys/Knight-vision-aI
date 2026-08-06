import { NextResponse } from "next/server";
import {
  hasGeminiKey,
  isGeminiCoolingDown,
  parseDataUrl,
  tryGenerateWithGemini,
} from "@/lib/gemini";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const image = body.image as string | undefined;
    const language = (body.language as string) || "English";

    if (!image?.startsWith("data:image")) {
      return NextResponse.json(
        { error: "image data URL required" },
        { status: 400 }
      );
    }

    if (!hasGeminiKey()) {
      return NextResponse.json(
        {
          originalText: "",
          simpleExplanation:
            "Document reading needs a cloud key. Add GEMINI_API_KEY in .env.local, then try again.",
          deadlineHint: "",
          soft: true,
        },
        { status: 200 }
      );
    }

    if (isGeminiCoolingDown()) {
      return NextResponse.json(
        {
          originalText: "",
          simpleExplanation:
            "Cloud reading is cooling down for a short moment. Keep this page open and tap Analyze again in about 20 seconds.",
          deadlineHint: "",
          soft: true,
          source: "cooldown",
        },
        { status: 200 }
      );
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
      return NextResponse.json(
        {
          originalText: "",
          simpleExplanation:
            "Cloud reading is cooling down. Please try Analyze again in about 20 seconds.",
          deadlineHint: "",
          soft: true,
          source: "quota",
        },
        { status: 200 }
      );
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

    return NextResponse.json({
      originalText: parsed.originalText || "",
      simpleExplanation:
        parsed.simpleExplanation || "Could not simplify this document.",
      deadlineHint: parsed.deadlineHint || "",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Document analysis failed";
    return NextResponse.json(
      {
        originalText: "",
        simpleExplanation:
          "Something went wrong reading the document. Please try again shortly.",
        deadlineHint: "",
        soft: true,
        error: message,
      },
      { status: 200 }
    );
  }
}
