import { NextResponse } from 'next/server';
import { driveStatus } from '@/lib/puxin/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await driveStatus());
}
