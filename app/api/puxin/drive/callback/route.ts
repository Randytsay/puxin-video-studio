import { NextRequest, NextResponse } from 'next/server';
import { exchangeDriveCode } from '@/lib/puxin/drive';
import { driveOauthOrigin } from '@/lib/puxin/oauth-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = driveOauthOrigin(url.origin);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = request.cookies.get('puxin-drive-state')?.value;
  if (!state || !expected || state !== expected) return NextResponse.json({ error: '授權已過期，請重新連接 Google Drive' }, { status: 400 });
  if (!code) return NextResponse.redirect(new URL('/studio?drive=error', origin));
  try {
    await exchangeDriveCode(origin, code);
    const response = NextResponse.redirect(new URL('/studio?drive=connected', origin));
    response.cookies.delete('puxin-drive-state');
    return response;
  } catch {
    return NextResponse.redirect(new URL('/studio?drive=error', origin));
  }
}
