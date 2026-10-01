import { NextRequest, NextResponse } from 'next/server';
import { exchangeDriveCode } from '@/lib/puxin/drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/studio?drive=error', url.origin));
  try {
    await exchangeDriveCode(url.origin, code);
    return NextResponse.redirect(new URL('/studio?drive=connected', url.origin));
  } catch {
    return NextResponse.redirect(new URL('/studio?drive=error', url.origin));
  }
}
