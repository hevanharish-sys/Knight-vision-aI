/**
 * Offline document OCR + plain-language hints when Gemini quota is unavailable.
 */

export type LocalDocumentResult = {
  originalText: string;
  simpleExplanation: string;
  deadlineHint: string;
  source: "local-ocr";
};

function cleanOcr(text: string) {
  return text
    .replace(/[|]/g, "I")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findDeadlineHint(text: string): string {
  const patterns = [
    /\b(?:due|pay\s*by|before|deadline|last\s*date|valid\s*(?:till|until)|expires?(?:\s*on)?)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/i,
    /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      return `Important date found: ${m[1] || m[0]}. Mark it on your calendar or ask someone to confirm.`;
    }
  }
  return "";
}

function simplifyText(text: string, language: string): string {
  const lower = text.toLowerCase();
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const firstLines = lines.slice(0, 6).join(" ");

  const tips: string[] = [];

  if (
    /\b(rx|tablet|tab\.|capsule|mg|ml|syrup|dose|twice|once\s+daily|bd|od|tid)\b/i.test(
      text
    )
  ) {
    tips.push(
      "This looks like a medicine paper. Take only what a doctor wrote — check the name, how many, and when to take it."
    );
    const dose = text.match(
      /\b([A-Za-z][A-Za-z0-9\-]{2,})\s+(\d+\s?(?:mg|ml|mcg|g))\b/i
    );
    if (dose) {
      tips.push(`Medicine hint: ${dose[1]} ${dose[2]}.`);
    }
  } else if (/\b(invoice|bill|amount|rs\.?|inr|total|gst|due)\b/i.test(text)) {
    tips.push(
      "This looks like a bill. Check the total amount and the due date before you pay."
    );
    const amount = text.match(
      /(?:rs\.?|inr|₹)\s*([0-9,]+\.?\d*)|\btotal\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([0-9,]+\.?\d*)/i
    );
    if (amount) {
      tips.push(`Amount seen: ${amount[1] || amount[2]}.`);
    }
  } else if (
    /\b(account|bank|ifsc|aadhaar|pan|government|notice|letter)\b/i.test(text)
  ) {
    tips.push(
      "This looks like a bank or government notice. Read any action line carefully and keep a copy."
    );
  } else {
    tips.push(
      "Here is a simple reading of the page from on-device text scan."
    );
  }

  if (firstLines) {
    tips.push(
      firstLines.length > 320 ? `${firstLines.slice(0, 320)}…` : firstLines
    );
  } else {
    tips.push(
      "No clear text was found. Retake the photo in bright light, fill the frame, and try again."
    );
  }

  if (language && language !== "English") {
    tips.push(
      `(Summary language preference: ${language}. Full translation needs cloud reading when quota recovers.)`
    );
  }

  if (/\burgent|immediately|within\s+\d+\s+days|overdue\b/i.test(lower)) {
    tips.push("This text may be time-sensitive — ask someone you trust to double-check.");
  }

  return tips.join(" ");
}

export async function readDocumentLocally(
  imageDataUrl: string,
  language = "English"
): Promise<LocalDocumentResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(imageDataUrl);
    const originalText = cleanOcr(text);
    return {
      originalText,
      simpleExplanation: simplifyText(originalText, language),
      deadlineHint: findDeadlineHint(originalText),
      source: "local-ocr",
    };
  } finally {
    await worker.terminate();
  }
}
