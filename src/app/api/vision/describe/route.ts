import { NextResponse } from "next/server";
import {
  hasGeminiKey,
  isGeminiCoolingDown,
  parseDataUrl,
  tryGenerateWithGemini,
} from "@/lib/gemini";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are the Knight Vision AI scene assistant for people who are blind or have low vision.
Describe the camera scene in 2-4 short spoken sentences.
Use the on-device detector list when provided — confirm objects, add left/right/near, hazards, doors, stairs, signs, readable text/OCR, medicine labels, currency if visible.
Be concrete and calm. No markdown. Never refuse — give the best short description you can.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const image = body.image as string | undefined;
    const detectorSummary = (body.detectorSummary as string) || "";

    if (!image?.startsWith("data:image")) {
      return NextResponse.json(
        { ok: false, description: null, source: "none", error: "image required" },
        { status: 400 }
      );
    }

    if (!hasGeminiKey()) {
      // 200 so the browser does not treat this as a failed fetch
      return NextResponse.json({
        ok: false,
        description: null,
        source: "none",
        error: "missing_key",
      });
    }

    if (isGeminiCoolingDown()) {
      return NextResponse.json({
        ok: false,
        description: null,
        source: "cooldown",
        error: null,
      });
    }

    const { mimeType, data } = parseDataUrl(image);
    const description = await tryGenerateWithGemini({
      systemInstruction: SYSTEM_PROMPT,
      parts: [
        {
          text: `On-device detections: ${detectorSummary || "none"}.
Describe everything useful for safe navigation and reading from the image.`,
        },
        { inlineData: { mimeType, data } },
      ],
    });

    if (!description) {
      return NextResponse.json({
        ok: false,
        description: null,
        source: "quota",
        error: null,
      });
    }

    return NextResponse.json({
      ok: true,
      description,
      source: "gemini",
      error: null,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      description: null,
      source: "error",
      error: null,
    });
  }
}
