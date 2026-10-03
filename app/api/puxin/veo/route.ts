import { NextRequest, NextResponse } from 'next/server';
import {
  chooseVeoDurationSeconds,
  pollPuxinVeoGeneration,
  submitPuxinVeoGeneration,
  VEO_ALLOWED_DURATIONS,
  type VeoDurationSeconds,
} from '@/lib/puxin/veo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      imageUrl?: string;
      durationSeconds?: number;
      prompt?: string;
      storyContext?: string;
      clipDuration?: number;
    };
    if (typeof body.imageUrl !== 'string' || !body.imageUrl.trim()) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }
    const requested = body.durationSeconds ?? chooseVeoDurationSeconds(Number(body.clipDuration));
    if (!VEO_ALLOWED_DURATIONS.includes(requested as VeoDurationSeconds)) {
      return NextResponse.json({ error: 'durationSeconds must be 4, 6, or 8' }, { status: 400 });
    }
    const result = await submitPuxinVeoGeneration({
      imageUrl: body.imageUrl,
      durationSeconds: requested as VeoDurationSeconds,
      prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
      storyContext: typeof body.storyContext === 'string' ? body.storyContext : undefined,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const operationName = new URL(request.url).searchParams.get('operationName');
    if (!operationName) {
      return NextResponse.json({ error: 'operationName is required' }, { status: 400 });
    }
    return NextResponse.json(await pollPuxinVeoGeneration(operationName));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
