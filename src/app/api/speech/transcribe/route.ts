import { NextResponse } from "next/server";
import { fileToBase64, generateWithGemini, hasGeminiKey } from "@/lib/gemini";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!hasGeminiKey()) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured. Add it to .env.local" },
        { status: 503 }
      );
    }

    const form = await request.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "audio file required" }, { status: 400 });
    }

    const { mimeType, data } = await fileToBase64(file);
    const text = await generateWithGemini({
      systemInstruction:
        "You are a speech transcription engine. Transcribe the audio accurately. Return only the transcript text, no quotes or commentary.",
      parts: [
        { text: "Transcribe this audio." },
        { inlineData: { mimeType, data } },
      ],
    });

    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed";
    const status = message.includes("quota") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
