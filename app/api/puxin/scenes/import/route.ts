import { mkdir, writeFile, readFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { createAuthorizedDrive, downloadDriveFile, isDriveId } from '@/lib/puxin/drive';
import { existingMediaPath, mediaPath, mediaUrl } from '@/lib/puxin/paths';
import { randomUUID } from 'node:crypto';
import { splitComicImage, type SplitMode } from '@/lib/puxin/scene-split';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGES = 30;

function safeStem(name: string): string {
  return path.basename(name, path.extname(name)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'scene';
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { fileIds?: string[]; localImages?: { url: string; name: string; mode?: SplitMode; splitPercent?: number }[]; mode?: SplitMode; selections?: Record<string, { mode: SplitMode; splitPercent?: number }> };
    const fileIds = Array.isArray(body.fileIds) ? body.fileIds.filter((id) => typeof id === 'string' && isDriveId(id)) : [];
    const localImages = Array.isArray(body.localImages) ? body.localImages : [];
    if (fileIds.length + localImages.length === 0) return NextResponse.json({ error: '請至少選擇一張圖片' }, { status: 400 });
    if (fileIds.length + localImages.length > MAX_IMAGES) return NextResponse.json({ error: `每個作品最多 ${MAX_IMAGES} 張圖片` }, { status: 400 });
    const mode: SplitMode = body.mode === 'single' || body.mode === 'double' ? body.mode : body.mode === 'auto' ? 'auto' : 'single';
    const origin = new URL(request.url).origin;
    const drive = fileIds.length ? await createAuthorizedDrive(origin) : null;
    const outputDir = path.dirname(await mediaPath('image/placeholder.png'));
    await mkdir(outputDir, { recursive: true });

    const scenes: Array<Record<string, unknown>> = [];
    for (let sourceIndex = 0; sourceIndex < fileIds.length + localImages.length; sourceIndex += 1) {
      const local = localImages[sourceIndex - fileIds.length];
      if (local && !local.url?.startsWith('/api/puxin/media/image/')) throw new Error('請先上傳圖片');
      const source = local ? { buffer: await readFile(await existingMediaPath(local.url.replace('/api/puxin/media/', ''))), name: local.name } : await downloadDriveFile(drive!, fileIds[sourceIndex]);
      const selection = local || body.selections?.[fileIds[sourceIndex]];
      const selectedMode = selection?.mode === 'single' || selection?.mode === 'double' || selection?.mode === 'auto' ? selection.mode : mode;
      const analysis = await splitComicImage(source.buffer, selectedMode, selection?.splitPercent);
      for (const panel of analysis.panels) {
        const suffix = panel.panel === 'single' ? '' : panel.panel === 'top' ? 'A' : 'B';
        const filename = `${randomUUID()}-${sourceIndex}-${safeStem(source.name)}${suffix}.png`;
        await writeFile(path.join(outputDir, filename), panel.buffer);
        scenes.push({
          id: `${local?.url || fileIds[sourceIndex]}-${panel.panel}`,
          sourceId: local?.url || fileIds[sourceIndex],
          sourceName: source.name,
          sourceIndex,
          panel: panel.panel,
          splitMode: analysis.mode,
          splitY: analysis.splitY,
          confidence: analysis.confidence,
          width: panel.width,
          height: panel.height,
          imageUrl: mediaUrl(`image/${filename}`),
        });
      }
    }
    return NextResponse.json({ scenes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
