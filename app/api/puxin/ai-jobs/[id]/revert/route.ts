import { NextRequest, NextResponse } from 'next/server';
import { revertAiJob } from '@/lib/puxin/ai-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function POST(_: NextRequest, context: Context) {
  try {
    return NextResponse.json(revertAiJob((await context.params).id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '無法還原原圖' },
      { status: 400 },
    );
  }
}
