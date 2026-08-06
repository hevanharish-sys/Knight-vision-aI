import { NextResponse } from "next/server";
import {
  hasGeminiKey,
  isGeminiCoolingDown,
  tryGenerateWithGemini,
} from "@/lib/gemini";
import { fallbackTranslate } from "@/lib/offline-translate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { text, sourceLang, targetLang } = await request.json();
    if (!text || !targetLang) {
      return NextResponse.json(
        { error: "text and targetLang required" },
        { status: 400 }
      );
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
      return NextResponse.json(
        {
          error:
            "Translation is briefly unavailable. Please try again in about 20 seconds.",
          soft: true,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
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
    return NextResponse.json({ error: message, soft: true }, { status: 500 });
  }
}
