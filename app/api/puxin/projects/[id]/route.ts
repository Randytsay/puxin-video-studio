import { NextRequest, NextResponse } from 'next/server';
import { getProject, saveProject } from '@/lib/puxin/projects';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(_: NextRequest, context: Context) {
  const record = getProject((await context.params).id);
  return NextResponse.json(record || { error: '找不到作品' }, { status: record ? 200 : 404 });
}
export async function PUT(request: NextRequest, context: Context) {
  try { return NextResponse.json(saveProject({ ...await request.json(), id: (await context.params).id })); }
  catch (error) { const message = error instanceof Error ? error.message : '無法保存'; return NextResponse.json({ error: message }, { status: message.includes('另一個視窗') ? 409 : 400 }); }
}
