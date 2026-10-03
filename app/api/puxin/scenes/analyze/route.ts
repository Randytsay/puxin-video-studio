import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { NextRequest, NextResponse } from 'next/server';
import { createAuthorizedDrive, downloadDriveFile, isDriveId } from '@/lib/puxin/drive';
import { existingMediaPath } from '@/lib/puxin/paths';
import { splitComicImage } from '@/lib/puxin/scene-split';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { id?: string; url?: string; local?: boolean };
    let buffer: Buffer;
    if (body.local) {
      if (!body.url?.startsWith('/api/puxin/media/image/')) throw new Error('請先上傳圖片');
      buffer = await readFile(await existingMediaPath(body.url.replace('/api/puxin/media/', '')));
    } else {
      if (!body.id || !isDriveId(body.id)) throw new Error('圖片識別碼不正確');
      const drive = await createAuthorizedDrive(new URL(request.url).origin);
      buffer = (await downloadDriveFile(drive, body.id)).buffer;
    }
    const analysis = await splitComicImage(buffer, 'auto');
    const metadata = await sharp(buffer).rotate().metadata();
    const splitPercent = analysis.splitY && metadata.height
      ? Math.round((analysis.splitY / metadata.height) * 100)
      : 50;
    return NextResponse.json({
      mode: analysis.mode,
      splitPercent: Math.max(10, Math.min(90, splitPercent)),
      confidence: analysis.confidence,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '無法分析圖片' },
      { status: 400 },
    );
  }
}
