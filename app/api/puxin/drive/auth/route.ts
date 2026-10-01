import { NextRequest, NextResponse } from 'next/server';
import { buildDriveConsentUrl } from '@/lib/puxin/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(buildDriveConsentUrl(origin));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
