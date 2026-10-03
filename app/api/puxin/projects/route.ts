import { NextRequest, NextResponse } from 'next/server';
import { listProjects, saveProject } from '@/lib/puxin/projects';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) { const archived = new URL(request.url).searchParams.get('archived') === '1'; return NextResponse.json({ projects: listProjects({ archived }) }); }
export async function POST(request: NextRequest) {
  try { const body = await request.json(); return NextResponse.json(saveProject({ ...body, id: undefined }), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '無法建立作品' }, { status: 400 }); }
}
