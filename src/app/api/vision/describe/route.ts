import { NextResponse } from "next/server";
import {
  hasGeminiKey,
  isGeminiCoolingDown,
  parseDataUrl,
  tryGenerateWithGemini,
} from "@/lib/gemini";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are the Knight Vision AI scene assistant for people who are blind or have low vision.
Look carefully at the image. Be precise — only name objects you clearly see.
Priority items: headphones, earbuds, microphone/mic, watch/wristwatch, ID card/badge, table/desk, chair, sofa, laptop, phone, keyboard, bottle, cup, glasses, bag, keys, door, stairs, people.
Describe the scene in 2-4 short spoken sentences with left/right/near when useful.
Also list every clear object you see (short lowercase names).
Return ONLY valid JSON with keys:
- description (string, spoken sentences)
- objects (array of short lowercase names, e.g. "headphones", "chair", "id card", "table", "microphone", "watch")
No markdown. Never refuse. Do not invent objects that are not visible.`;

function parseVisionPayload(raw: string): {
  description: string;
  objects: string[];
} {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as {
      description?: string;
      objects?: unknown;
    };
    const objects = Array.isArray(parsed.objects)
      ? parsed.objects
          .map((o) => String(o).trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 20)
      : [];
    const description =
      String(parsed.description || "").trim() || cleaned.slice(0, 500);
    return { description, objects };
  } catch {
    return { description: cleaned.slice(0, 600), objects: [] };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const image = body.image as string | undefined;
    const detectorSummary = (body.detectorSummary as string) || "";

    if (!image?.startsWith("data:image")) {
      return NextResponse.json(
        {
          ok: false,
          description: null,
          objects: [],
          source: "none",
          error: "image required",
        },
        { status: 400 }
      );
    }

    if (!hasGeminiKey()) {
      return NextResponse.json({
        ok: false,
        description: null,
        objects: [],
        source: "none",
        error: "missing_key",
      });
    }

    if (isGeminiCoolingDown()) {
      return NextResponse.json({
        ok: false,
        description: null,
        objects: [],
        source: "cooldown",
        error: null,
      });
    }

    const { mimeType, data } = parseDataUrl(image);
    const raw = await tryGenerateWithGemini({
      systemInstruction: SYSTEM_PROMPT,
      parts: [
        {
          text: `On-device detections: ${detectorSummary || "none"}.
Name headphones, mic, watch, ID card, table, chair and other visible items if present. JSON only.`,
        },
        { inlineData: { mimeType, data } },
      ],
    });

    if (!raw) {
      return NextResponse.json({
        ok: false,
        description: null,
        objects: [],
        source: "quota",
        error: null,
      });
    }

    const { description, objects } = parseVisionPayload(raw);

    return NextResponse.json({
      ok: true,
      description,
      objects,
      source: "gemini",
      error: null,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      description: null,
      objects: [],
      source: "error",
      error: null,
    });
  }
}
