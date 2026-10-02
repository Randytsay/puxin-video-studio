import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/puxin/projects';
import { uploadJobToDrive } from '@/lib/puxin/drive-output';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const job = getJob((await context.params).id);
  if (!job) return NextResponse.json({ error: '找不到匯出紀錄' }, { status: 404 });
  try { return NextResponse.json({ driveUrl: await uploadJobToDrive(job, new URL(request.url).origin) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '上傳失敗' }, { status: 400 }); }
}
