import { NextRequest, NextResponse } from 'next/server';
import { createAiJob, listAiJobs, type AiGenerationProvider } from '@/lib/puxin/ai-jobs';
import { startAiWorker } from '@/lib/puxin/ai-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  startAiWorker();
  const projectId = new URL(request.url).searchParams.get('projectId') || undefined;
  return NextResponse.json({ jobs: listAiJobs(projectId) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      projectId?: string;
      revision?: number;
      clipIndex?: number;
      provider?: AiGenerationProvider;
      prompt?: string;
    };
    if (!body.projectId || !Number.isInteger(body.revision) || !Number.isInteger(body.clipIndex) || !body.provider) {
      return NextResponse.json({ error: 'projectId, revision, clipIndex and provider are required' }, { status: 400 });
    }
    const job = createAiJob({
      projectId: body.projectId,
      projectRevision: Number(body.revision),
      clipIndex: Number(body.clipIndex),
      provider: body.provider,
      prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
    });
    startAiWorker();
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '無法建立 AI 動態化工作' }, { status: 400 });
  }
}
