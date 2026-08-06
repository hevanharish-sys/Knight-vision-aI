import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Prefer lighter / higher-RPM models first to reduce 429s.
 */
export const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash-lite",
] as const;

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/** After a hard quota hit, skip cloud calls briefly (ms). */
let cloudCooldownUntil = 0;

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function isGeminiCoolingDown() {
  return Date.now() < cloudCooldownUntil;
}

export function markGeminiCooldown(ms = 20_000) {
  cloudCooldownUntil = Date.now() + ms;
}

export function clearGeminiCooldown() {
  cloudCooldownUntil = 0;
}

export function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return new GoogleGenerativeAI(apiKey);
}

export function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL");
  }
  return { mimeType: match[1], data: match[2] };
}

export async function fileToBase64(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    mimeType: file.type || "application/octet-stream",
    data: buffer.toString("base64"),
  };
}

function isQuotaError(message: string) {
  return (
    message.includes("429") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("exceeded your current quota") ||
    message.includes("limit: 0") ||
    message.includes("Too Many Requests")
  );
}

function friendlyQuotaMessage(_raw: string) {
  return "Gemini quota busy — using on-device results for now.";
}

function extractText(result: {
  response: {
    text: () => string;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
}) {
  try {
    return result.response.text()?.trim() || "";
  } catch (textError) {
    const message =
      textError instanceof Error ? textError.message : String(textError);
    const candidate = result.response.candidates?.[0]?.content?.parts
      ?.map((p) => ("text" in p ? p.text : ""))
      .join("")
      .trim();
    if (candidate) return candidate;
    throw new Error(message || "Empty Gemini response");
  }
}

/** Try free-tier models in order until one succeeds. */
export async function generateWithGemini(options: {
  systemInstruction?: string;
  parts: GeminiPart[];
  /** If true, ignore short cooldown and attempt anyway. */
  force?: boolean;
}) {
  if (!options.force && isGeminiCoolingDown()) {
    throw new Error(friendlyQuotaMessage("cooldown"));
  }

  const genAI = getGemini();
  let lastError: Error | null = null;
  let sawQuota = false;

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: options.systemInstruction,
      });
      const result = await model.generateContent(options.parts);
      const text = extractText(result);
      clearGeminiCooldown();
      return text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("API_KEY_INVALID") ||
        message.includes("API key not valid")
      ) {
        throw new Error(
          "Invalid GEMINI_API_KEY. Get a new key from https://aistudio.google.com/apikey"
        );
      }
      if (isQuotaError(message)) {
        sawQuota = true;
        lastError = new Error(friendlyQuotaMessage(message));
        continue;
      }
      lastError = new Error(message);
      continue;
    }
  }

  // Longer cool-down so the UI stops hammering a depleted free-tier key
  if (sawQuota) markGeminiCooldown(45_000);
  throw lastError || new Error("All Gemini models failed");
}

/**
 * Soft wrapper for UI features: returns null instead of throwing on quota/errors.
 */
export async function tryGenerateWithGemini(options: {
  systemInstruction?: string;
  parts: GeminiPart[];
}): Promise<string | null> {
  if (isGeminiCoolingDown()) return null;
  try {
    const text = await generateWithGemini(options);
    return text || null;
  } catch {
    return null;
  }
}
