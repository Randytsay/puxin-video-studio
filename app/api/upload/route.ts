import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { detectMediaKind, type MediaKind } from './detect';
import { sweepUploadsInBackground } from '@/lib/utils/retention';
import { logError } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Must stay <= `proxyClientMaxBodySize` in next.config.ts. Next clones the
// request body for every route covered by a proxy/middleware and *truncates*
// (does not reject) anything over that limit, which would surface here as an
// unparseable multipart body rather than the clean 413 below.
const MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * Extensions the stored filename may carry, keyed by the kind detected from
 * magic bytes. A client extension is honoured only if it appears in the list
 * for its *detected* kind; anything else (notably `.html`, `.svg`, `.js`)
 * falls back to the canonical default.
 *
 * Refining within an already-verified kind is safe — a PNG saved as `.webp`
 * is still served as an image — while `.html` can never survive, so a file
 * under public/ can never be served as a same-origin document.
 */
const ALLOWED_EXTENSIONS: Record<MediaKind, readonly string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  audio: ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.m4b', '.aac'],
  video: ['.mp4', '.mov', '.webm', '.m4v'],
};

const DEFAULT_EXTENSION: Record<MediaKind, string> = {
  image: '.jpg',
  audio: '.mp3',
  video: '.mp4',
};

function safeExtension(originalName: string, kind: MediaKind): string {
  const ext = path.extname(originalName).toLowerCase();
  return ALLOWED_EXTENSIONS[kind].includes(ext) ? ext : DEFAULT_EXTENSION[kind];
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 100MB limit' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const subdir = detectMediaKind(buffer);
    if (!subdir) {
      return NextResponse.json(
        { error: 'Unsupported or unrecognized file content' },
        { status: 415 }
      );
    }

    // The extension is derived from the *detected* kind, never from file.name.
    // Everything under public/ is served same-origin, so honouring a client
    // extension would let `pwn.html` (prefixed with two MPEG sync bytes to pass
    // detectMediaKind) be stored and served as text/html — stored XSS that
    // nosniff cannot stop, because the extension really is .html.
    const stem = path
      .basename(file.name, path.extname(file.name))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 100);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${stem}${safeExtension(file.name, subdir)}`;
    const saveDir = path.join(process.cwd(), 'public', 'uploads', subdir);
    const savePath = path.join(saveDir, filename);

    await mkdir(saveDir, { recursive: true });
    await writeFile(savePath, buffer);

    // Expire old uploads/outputs. Self-throttling, and intentionally not
    // awaited so it never delays the response.
    void sweepUploadsInBackground();

    return NextResponse.json({
      url: `/uploads/${subdir}/${filename}`,
      type: subdir,
      filename,
      size: file.size,
    });
  } catch (err) {
    // A body larger than `proxyClientMaxBodySize` is truncated upstream rather
    // than rejected, so formData() throws mid-parse. Report that as a 413 the
    // client can explain, and keep filesystem paths out of the response.
    const message = err instanceof Error ? err.message : String(err);
    if (/multipart|boundary|malformed|unexpected end/i.test(message)) {
      return NextResponse.json(
        { error: `Upload was truncated or malformed. Files must be under ${MAX_FILE_SIZE / (1024 * 1024)}MB.` },
        { status: 413 },
      );
    }
    const errorId = Math.random().toString(36).slice(2, 10);
    logError(`[upload:${errorId}] upload failed`, err);
    return NextResponse.json({ error: `Upload failed. Reference: ${errorId}` }, { status: 500 });
  }
}
