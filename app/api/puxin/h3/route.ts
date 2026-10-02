import { NextRequest, NextResponse } from 'next/server';
import { getH3Job, submitH3Generation } from '@/lib/puxin/h3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { imageUrl?: string; durationSeconds?: number; prompt?: string; storyContext?: string };
    if (!body.imageUrl) return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    return NextResponse.json(await submitH3Generation({
      imageUrl: body.imageUrl,
      durationSeconds: Number(body.durationSeconds || 8),
      prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
      storyContext: typeof body.storyContext === 'string' ? body.storyContext : undefined,
    }), { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'MiniMax H3 生成失敗' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    return NextResponse.json(await getH3Job(id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '找不到 H3 工作' }, { status: 404 });
  }
}
