import sharp from 'sharp';

export type SplitMode = 'auto' | 'single' | 'double';

export interface ScenePanel {
  panel: 'single' | 'top' | 'bottom';
  buffer: Buffer;
  width: number;
  height: number;
}

export interface SplitAnalysis {
  mode: 'single' | 'double';
  splitY: number | null;
  confidence: number;
  panels: ScenePanel[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function rowStats(data: Buffer, width: number, channels: number, y: number) {
  let sum = 0;
  let sumSq = 0;
  for (let x = 0; x < width; x += 2) {
    const offset = (y * width + x) * channels;
    const gray = data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
    sum += gray;
    sumSq += gray * gray;
  }
  const n = Math.ceil(width / 2);
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  return { mean, std: Math.sqrt(variance) };
}

async function detectDivider(buffer: Buffer): Promise<{ splitY: number | null; confidence: number; width: number; height: number }> {
  const { data, info } = await sharp(buffer).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (!width || !height || channels < 3) return { splitY: null, confidence: 0, width, height };

  const minY = Math.round(height * 0.36);
  const maxY = Math.round(height * 0.64);
  let best: { y: number; std: number; contrast: number; score: number } | null = null;
  for (let y = minY; y <= maxY; y += 1) {
    const current = rowStats(data, width, channels, y);
    const up = rowStats(data, width, channels, Math.max(0, y - 8));
    const down = rowStats(data, width, channels, Math.min(height - 1, y + 8));
    const neighborMean = (up.mean + down.mean) / 2;
    const contrast = Math.abs(current.mean - neighborMean);
    const uniform = clamp01((34 - current.std) / 34);
    const extreme = Math.max(clamp01((80 - current.mean) / 80), clamp01((current.mean - 175) / 80));
    const contrastScore = clamp01(contrast / 55);
    const centerBias = clamp01(1 - Math.abs(y / height - 0.5) / 0.14);
    const score = uniform * 0.42 + extreme * 0.22 + contrastScore * 0.26 + centerBias * 0.1;
    if (!best || score > best.score) best = { y, std: current.std, contrast, score };
  }

  if (!best || best.score < 0.58 || best.std > 32 || best.contrast < 12) {
    return { splitY: null, confidence: best?.score ?? 0, width, height };
  }
  return { splitY: best.y, confidence: best.score, width, height };
}

export async function splitComicImage(buffer: Buffer, mode: SplitMode = 'auto', manualSplitPercent?: number): Promise<SplitAnalysis> {
  const detected = await detectDivider(buffer);
  if (mode === 'single') {
    const normalized = await sharp(buffer).rotate().png().toBuffer({ resolveWithObject: true });
    return {
      mode: 'single',
      splitY: null,
      confidence: 1,
      panels: [{ panel: 'single', buffer: normalized.data, width: normalized.info.width, height: normalized.info.height }],
    };
  }
  const shouldSplit = mode === 'double' || (mode === 'auto' && detected.splitY !== null);
  if (!shouldSplit) {
    const normalized = await sharp(buffer).rotate().png().toBuffer({ resolveWithObject: true });
    return {
      mode: 'single',
      splitY: null,
      confidence: detected.confidence,
      panels: [{ panel: 'single', buffer: normalized.data, width: normalized.info.width, height: normalized.info.height }],
    };
  }

  const normalizedInput = sharp(buffer).rotate();
  const metadata = await normalizedInput.metadata();
  const width = detected.width || metadata.width!;
  const height = detected.height || metadata.height!;
  const splitY = manualSplitPercent !== undefined && Number.isFinite(manualSplitPercent) && manualSplitPercent >= 10 && manualSplitPercent <= 90 ? Math.round(height * manualSplitPercent / 100) : detected.splitY ?? Math.round(height / 2);
  const gap = Math.max(2, Math.round(height * 0.0025));
  const topHeight = Math.max(1, splitY - gap);
  const bottomTop = Math.min(height - 1, splitY + gap);
  const bottomHeight = Math.max(1, height - bottomTop);
  const normalizedBuffer = await sharp(buffer).rotate().toBuffer();
  const top = await sharp(normalizedBuffer).extract({ left: 0, top: 0, width, height: topHeight }).png().toBuffer();
  const bottom = await sharp(normalizedBuffer).extract({ left: 0, top: bottomTop, width, height: bottomHeight }).png().toBuffer();
  return {
    mode: 'double',
    splitY,
    confidence: mode === 'double' ? Math.max(0.75, detected.confidence) : detected.confidence,
    panels: [
      { panel: 'top', buffer: top, width, height: topHeight },
      { panel: 'bottom', buffer: bottom, width, height: bottomHeight },
    ],
  };
}
