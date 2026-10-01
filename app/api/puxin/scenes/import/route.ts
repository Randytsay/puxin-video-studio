import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { createAuthorizedDrive, downloadDriveFile, isDriveId } from '@/lib/puxin/drive';
import { splitComicImage, type SplitMode } from '@/lib/puxin/scene-split';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGES = 30;

function safeStem(name: string): string {
  return path.basename(name, path.extname(name)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'scene';
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { fileIds?: string[]; mode?: SplitMode };
    const fileIds = Array.isArray(body.fileIds) ? body.fileIds.filter((id) => typeof id === 'string' && isDriveId(id)) : [];
    if (fileIds.length === 0) return NextResponse.json({ error: 'Select at least one image' }, { status: 400 });
    if (fileIds.length > MAX_IMAGES) return NextResponse.json({ error: `Maximum ${MAX_IMAGES} images per project` }, { status: 400 });
    const mode: SplitMode = body.mode === 'single' || body.mode === 'double' ? body.mode : 'auto';
    const origin = new URL(request.url).origin;
    const drive = await createAuthorizedDrive(origin);
    const outputDir = path.join(process.cwd(), 'public', 'uploads', 'image', 'puxin');
    await mkdir(outputDir, { recursive: true });

    const scenes: Array<Record<string, unknown>> = [];
    for (let sourceIndex = 0; sourceIndex < fileIds.length; sourceIndex += 1) {
      const source = await downloadDriveFile(drive, fileIds[sourceIndex]);
      const analysis = await splitComicImage(source.buffer, mode);
      for (const panel of analysis.panels) {
        const suffix = panel.panel === 'single' ? '' : panel.panel === 'top' ? 'A' : 'B';
        const filename = `${Date.now()}-${sourceIndex}-${safeStem(source.name)}${suffix}.png`;
        await writeFile(path.join(outputDir, filename), panel.buffer);
        scenes.push({
          id: `${fileIds[sourceIndex]}-${panel.panel}`,
          sourceId: fileIds[sourceIndex],
          sourceName: source.name,
          sourceIndex,
          panel: panel.panel,
          splitMode: analysis.mode,
          splitY: analysis.splitY,
          confidence: analysis.confidence,
          width: panel.width,
          height: panel.height,
          imageUrl: `/uploads/image/puxin/${filename}`,
        });
      }
    }
    return NextResponse.json({ scenes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
