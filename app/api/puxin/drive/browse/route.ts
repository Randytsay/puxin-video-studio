import { NextRequest, NextResponse } from 'next/server';
import { PUXIN_DRIVE_ROOT_FOLDER_ID, assertInsidePuxinRoot, createAuthorizedDrive, listDriveChildren } from '@/lib/puxin/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const folderId = url.searchParams.get('folder') || PUXIN_DRIVE_ROOT_FOLDER_ID;
    const drive = await createAuthorizedDrive(url.origin);
    await assertInsidePuxinRoot(drive, folderId);
    return NextResponse.json({ folderId, ...(await listDriveChildren(drive, folderId)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
