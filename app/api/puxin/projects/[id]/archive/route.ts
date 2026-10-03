import { NextRequest, NextResponse } from 'next/server';
import { setProjectArchived } from '@/lib/puxin/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const body = await request.json() as { archived?: boolean };
    return NextResponse.json(setProjectArchived((await context.params).id, body.archived !== false));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '無法更新作品狀態' },
      { status: 400 },
    );
  }
}
