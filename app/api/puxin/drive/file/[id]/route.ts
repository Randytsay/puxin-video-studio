import { NextRequest, NextResponse } from 'next/server';
import { createAuthorizedDrive, downloadDriveFile } from '@/lib/puxin/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const drive = await createAuthorizedDrive(new URL(request.url).origin);
    const file = await downloadDriveFile(drive, id);
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: { 'Content-Type': file.mimeType, 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}
