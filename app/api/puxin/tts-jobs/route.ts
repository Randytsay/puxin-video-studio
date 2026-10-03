import { NextRequest, NextResponse } from 'next/server';
import { createTtsJob, listTtsJobs } from '@/lib/puxin/tts-jobs';
import { startTtsWorker } from '@/lib/puxin/tts-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  startTtsWorker();
  const projectId = new URL(request.url).searchParams.get('projectId') || undefined;
  return NextResponse.json({ jobs: listTtsJobs(projectId) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { projectId?: string; revision?: number };
    if (!body.projectId || !Number.isInteger(body.revision)) {
      return NextResponse.json({ error: 'projectId and revision are required' }, { status: 400 });
    }
    const job = createTtsJob({ projectId: body.projectId, projectRevision: Number(body.revision) });
    startTtsWorker();
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '無法建立批次旁白工作' }, { status: 400 });
  }
}
