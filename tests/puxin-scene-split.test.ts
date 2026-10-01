import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { splitComicImage } from '@/lib/puxin/scene-split';

async function doublePanelImage(): Promise<Buffer> {
  const top = await sharp({ create: { width: 400, height: 244, channels: 3, background: '#d8b89a' } }).png().toBuffer();
  const divider = await sharp({ create: { width: 400, height: 12, channels: 3, background: '#141414' } }).png().toBuffer();
  const bottom = await sharp({ create: { width: 400, height: 244, channels: 3, background: '#88a9b8' } }).png().toBuffer();
  return sharp({ create: { width: 400, height: 500, channels: 3, background: '#ffffff' } })
    .composite([
      { input: top, top: 0, left: 0 },
      { input: divider, top: 244, left: 0 },
      { input: bottom, top: 256, left: 0 },
    ])
    .png()
    .toBuffer();
}

async function singlePanelImage(): Promise<Buffer> {
  const width = 400;
  const height = 500;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      raw[offset] = (x * 7 + y * 3) % 255;
      raw[offset + 1] = (x * 5 + y * 11) % 255;
      raw[offset + 2] = (x * 13 + y * 2) % 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe('splitComicImage', () => {
  it('detects a strong horizontal divider and returns two panels', async () => {
    const result = await splitComicImage(await doublePanelImage(), 'auto');
    expect(result.mode).toBe('double');
    expect(result.panels).toHaveLength(2);
    expect(result.panels.map((panel) => panel.panel)).toEqual(['top', 'bottom']);
    expect(result.confidence).toBeGreaterThan(0.58);
  });

  it('keeps a textured single-page illustration intact', async () => {
    const result = await splitComicImage(await singlePanelImage(), 'auto');
    expect(result.mode).toBe('single');
    expect(result.panels).toHaveLength(1);
  });

  it('supports an explicit manual double override', async () => {
    const result = await splitComicImage(await singlePanelImage(), 'double');
    expect(result.mode).toBe('double');
    expect(result.panels).toHaveLength(2);
  });
});
