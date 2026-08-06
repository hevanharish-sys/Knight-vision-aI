import { NextResponse } from "next/server";
import {
  hasGeminiKey,
  parseDataUrl,
  tryGenerateWithGeminiDetailed,
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
          simpleExplanation: "",
          deadlineHint: "",
          soft: true,
          source: "no-key",
          fallback: true,
          error:
            "Document cloud reading needs GEMINI_API_KEY. Using on-device OCR instead.",
        },
        { status: 200 }
      );
    }

    const { mimeType, data } = parseDataUrl(image);
    const result = await tryGenerateWithGeminiDetailed({
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

    if (!result.ok) {
      return NextResponse.json(
        {
          originalText: "",
          simpleExplanation: "",
          deadlineHint: "",
          soft: true,
          fallback: true,
          source: result.reason,
          error: result.message,
        },
        { status: 200 }
      );
    }

    const cleaned = result.text
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
      source: "gemini",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Document analysis failed";
    return NextResponse.json(
      {
        originalText: "",
        simpleExplanation: "",
        deadlineHint: "",
        soft: true,
        fallback: true,
        source: "error",
        error: message,
      },
      { status: 200 }
    );
  }
}
