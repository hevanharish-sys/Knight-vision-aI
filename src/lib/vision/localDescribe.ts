/**
 * Offline scene hints from a camera JPEG when Gemini quota is unavailable.
 * Not true object detection — calm, useful spoken guidance for demos/fallback.
 */
export async function describeFrameLocally(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const { width, height } = img;
  const canvas = document.createElement("canvas");
  const w = Math.min(160, width);
  const h = Math.max(1, Math.round((height / width) * w));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return "Camera is active. I cannot analyze this frame offline — try Describe again shortly.";
  }
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  let sum = 0;
  let sumSq = 0;
  let warm = 0;
  let cool = 0;
  let skin = 0;
  let edge = 0;
  let topBright = 0;
  let botBright = 0;
  const midY = Math.floor(h / 2);
  const n = w * h;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += y;
    sumSq += y * y;
    if (r > b + 12) warm += 1;
    else if (b > r + 12) cool += 1;

    // rough skin-tone band
    if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
      skin += 1;
    }

    const px = (i / 4) % w;
    const py = Math.floor(i / 4 / w);
    if (py < midY) topBright += y;
    else botBright += y;

    // cheap horizontal edge energy
    if (px < w - 1) {
      const nr = data[i + 4];
      const ng = data[i + 5];
      const nb = data[i + 6];
      const ny = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      edge += Math.abs(y - ny);
    }
  }

  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const contrast = Math.sqrt(Math.max(0, variance));
  const skinRatio = skin / n;
  const warmRatio = warm / n;
  const edgeScore = edge / n;
  const topMean = topBright / (w * midY || 1);
  const botMean = botBright / (w * (h - midY) || 1);

  const parts: string[] = [];

  if (mean < 45) {
    parts.push("The scene looks quite dark. Move toward brighter light if you can.");
  } else if (mean > 200) {
    parts.push("The view is very bright — possibly outdoors or facing a strong light.");
  } else {
    parts.push("Lighting looks usable for reading and navigation.");
  }

  if (skinRatio > 0.08) {
    parts.push("Someone appears close in front of the camera.");
  } else if (skinRatio > 0.035) {
    parts.push("A person may be nearby in the frame.");
  }

  if (edgeScore > 28 && contrast > 45) {
    parts.push("The view looks busy with many details — scan slowly left to right.");
  } else if (edgeScore < 10 && contrast < 25) {
    parts.push("The view looks fairly plain — a wall, floor, or open space.");
  }

  if (topMean > botMean + 35 && cool / n > 0.2) {
    parts.push("The upper area looks brighter and cooler — possible sky or window ahead.");
  } else if (botMean > topMean + 25) {
    parts.push("The lower area is brighter — watch the ground path ahead.");
  }

  if (warmRatio > 0.45) {
    parts.push("Warm colors dominate — indoor wood, skin, or warm lamps are likely.");
  }

  parts.push(
    "Cloud vision is resting due to API limits. This is a quick offline hint — tap Describe again in a minute for a fuller reading."
  );

  return parts.slice(0, 4).join(" ");
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read camera frame"));
    img.src = src;
  });
}
