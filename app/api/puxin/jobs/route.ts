import { NextRequest, NextResponse } from 'next/server';
import { createJob, getProject, listJobs } from '@/lib/puxin/projects';
import { startRenderWorker } from '@/lib/puxin/render-worker';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) { startRenderWorker(); return NextResponse.json({ jobs: listJobs(new URL(request.url).searchParams.get('projectId') || undefined) }); }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json(); const project = getProject(body.projectId);
    if (!project) return NextResponse.json({ error: '找不到作品' }, { status: 404 });
    if (body.revision !== project.revision) return NextResponse.json({ error: '請先保存最新內容再匯出' }, { status: 409 });
    const job = createJob(project); startRenderWorker(); return NextResponse.json(job, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '無法建立匯出任務' }, { status: 400 }); }
}
