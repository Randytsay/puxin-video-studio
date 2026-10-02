import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { detectMediaKind } from '@/app/api/upload/detect';
import { mediaPath, mediaUrl } from '@/lib/puxin/paths';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData(); const file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > 100 * 1024 * 1024) return NextResponse.json({ error: '請上傳 100MB 以下的圖片或音訊' }, { status: 400 });
    let buffer = Buffer.from(await file.arrayBuffer());
    const kind = detectMediaKind(buffer);
    if (!kind) throw new Error('不支援這種檔案格式');
    let width: number | undefined, height: number | undefined;
    let ext = path.extname(file.name).toLowerCase();
    if (kind === 'image') {
      const image = await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().png().toBuffer({ resolveWithObject: true });
      buffer = Buffer.from(image.data); width = image.info.width; height = image.info.height; ext = '.png';
    } else if (!['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.mp4', '.mov', '.webm'].includes(ext)) throw new Error('請使用支援的音訊或影片副檔名');
    const key = `${kind}/${randomUUID()}${ext}`; const target = await mediaPath(key);
    await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, buffer);
    return NextResponse.json({ url: mediaUrl(key), kind, name: file.name, width, height });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '上傳失敗' }, { status: 400 }); }
}
