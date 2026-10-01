import { NextResponse } from 'next/server';
import { getVideoGenerationProviderStatuses } from '@/lib/puxin/video-providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ providers: getVideoGenerationProviderStatuses() });
}
