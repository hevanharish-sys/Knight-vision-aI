import { describeFrameLocally } from "@/lib/vision/localDescribe";
import { apiUrl } from "@/lib/api-base";

export type SceneDescription = {
  description: string;
  source: "gemini" | "detector" | "offline";
  notice?: string;
  objects?: string[];
};

export type GeminiVisionResult = {
  description: string;
  objects: string[];
};

/** Ask Gemini for a richer scene description + object list. Never throws. */
export async function askGeminiVision(
  imageDataUrl: string,
  detectorSummary: string
): Promise<GeminiVisionResult | null> {
  try {
    const res = await fetch(apiUrl("/api/vision/describe"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: imageDataUrl,
        detectorSummary,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.ok && data?.description) {
      const objects = Array.isArray(data.objects)
        ? data.objects.map((o: unknown) => String(o).trim().toLowerCase()).filter(Boolean)
        : [];
      return { description: String(data.description), objects };
    }
    return null;
  } catch {
    return null;
  }
}

export async function fallbackSceneHint(imageDataUrl: string): Promise<string> {
  try {
    return await describeFrameLocally(imageDataUrl);
  } catch {
    return "Camera is on, but I could not analyze this frame. Try again.";
  }
}

/** Easy Mode / generic: Gemini first, then offline hint. */
export async function describeScene(imageDataUrl: string): Promise<SceneDescription> {
  const gemini = await askGeminiVision(imageDataUrl, "");
  if (gemini) {
    return {
      description: gemini.description,
      source: "gemini",
      objects: gemini.objects,
    };
  }
  return {
    description: await fallbackSceneHint(imageDataUrl),
    source: "offline",
    notice: "Gemini busy — used an offline scene hint.",
  };
}
