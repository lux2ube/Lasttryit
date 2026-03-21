import { createWorker } from "tesseract.js";
import sharp from "sharp";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";

const CACHE_DIR = path.join(os.tmpdir(), "tessdata_cache");

/**
 * Preprocess the image buffer in multiple ways to maximise OCR coverage.
 * Returns an array of { label, buffer } to try.
 */
async function buildVariants(inputBuffer: Buffer): Promise<{ label: string; buffer: Buffer }[]> {
  const meta = await sharp(inputBuffer).metadata();
  const w = meta.width ?? 500;

  // Base: upscale to ~2400px wide
  const scale = w < 2400 ? Math.ceil(2400 / Math.max(w, 1)) : 1;

  const base = sharp(inputBuffer).resize(w * scale, null, { kernel: sharp.kernel.lanczos3 });
  const rot90 = sharp(inputBuffer).rotate(90).resize(w * scale, null, { kernel: sharp.kernel.lanczos3 });

  const variants: { label: string; buffer: Buffer }[] = [];

  // v1: no rotation, normalised + sharpened
  variants.push({
    label: "orig-normalise",
    buffer: await base.clone().grayscale().normalise({ lower: 8, upper: 92 })
      .sharpen({ sigma: 1.4, m1: 1.2, m2: 12 }).png({ compressionLevel: 0 }).toBuffer(),
  });

  // v2: 90° rotation (many ID card photos are taken sideways)
  variants.push({
    label: "rot90-normalise",
    buffer: await rot90.clone().grayscale().normalise({ lower: 8, upper: 92 })
      .sharpen({ sigma: 1.4, m1: 1.2, m2: 12 }).png({ compressionLevel: 0 }).toBuffer(),
  });

  // v3: high contrast / threshold (good for printed text on light background)
  variants.push({
    label: "rot90-threshold",
    buffer: await rot90.clone().grayscale().normalise({ lower: 5, upper: 95 })
      .linear(1.8, -40)            // boost contrast
      .threshold(128)
      .png({ compressionLevel: 0 }).toBuffer(),
  });

  return variants;
}

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;

/** Reusable worker pool — keeps one worker warm per PSM mode */
const workerCache = new Map<string, Promise<TesseractWorker>>();

async function getOrCreateWorker(psm: string): Promise<TesseractWorker> {
  if (!workerCache.has(psm)) {
    workerCache.set(psm, (async () => {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      const w = await createWorker(["ara", "eng"], 1, {
        langPath: CACHE_DIR,
        logger: (m: any) => {
          if (m.status && m.progress > 0) {
            process.stdout.write(`\r[OCR-${psm}] ${m.status}: ${Math.round(m.progress * 100)}%  `);
          }
        },
      });
      await w.setParameters({ tessedit_pageseg_mode: psm as any });
      console.log(`\n[OCR] Worker PSM${psm} ready`);
      return w;
    })());
  }
  return workerCache.get(psm)!;
}

/**
 * Run server-side OCR with multiple preprocessing strategies and PSM modes.
 * Returns a combined text block giving DeepSeek the best chance to parse it.
 */
export async function extractTextFromImage(
  base64OrDataUrl: string,
  _mimeType = "image/jpeg"
): Promise<string> {
  // Decode base64
  const b64 = base64OrDataUrl.includes(",")
    ? base64OrDataUrl.split(",")[1]
    : base64OrDataUrl;
  const inputBuf = Buffer.from(b64, "base64");

  // Build image variants
  const variants = await buildVariants(inputBuf);

  // PSM modes to try:
  //   6 = uniform block of text
  //  11 = sparse text (good for mixed layouts)
  //   3 = auto (default)
  const psmModes = ["6", "11", "3"];

  const results: { label: string; text: string; wordCount: number }[] = [];

  for (const variant of variants) {
    for (const psm of psmModes) {
      try {
        const worker = await getOrCreateWorker(psm);
        const { data } = await worker.recognize(variant.buffer);
        const text = data.text || "";
        // Count real Arabic words (not just noise)
        const arabicWordCount = (text.match(/[\u0600-\u06FF]{2,}/g) || []).length;
        const digitCount = (text.match(/\d{3,}/g) || []).length;
        const score = arabicWordCount * 3 + digitCount * 2 + text.length;
        results.push({ label: `${variant.label}-PSM${psm}`, text, wordCount: score });
        console.log(`[OCR] ${variant.label}-PSM${psm}: ${text.length} chars, ${arabicWordCount} Arabic words, score=${score}`);
      } catch (err: any) {
        console.warn(`[OCR] ${variant.label}-PSM${psm} failed:`, err.message);
      }
    }
  }

  if (results.length === 0) return "";

  // Sort by score and pick the best two to combine
  results.sort((a, b) => b.wordCount - a.wordCount);
  const best = results.slice(0, 2);
  const combined = best.map(r => `[${r.label}]\n${r.text}`).join("\n\n");
  console.log(`\n[OCR] Best: ${best[0].label} (score ${best[0].wordCount}), combined ${combined.length} chars`);
  return combined;
}

/** Terminate all workers (call on server shutdown) */
export async function shutdownOcrWorkers() {
  for (const [psm, promise] of workerCache) {
    try {
      const w = await promise;
      await w.terminate();
    } catch { /* ignore */ }
  }
  workerCache.clear();
}
