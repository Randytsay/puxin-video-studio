import { NextResponse } from 'next/server';
import { applyAiJob } from '@/lib/puxin/ai-jobs';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(applyAiJob((await context.params).id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '無法套用 AI 動態影片' }, { status: 409 });
  }
}
