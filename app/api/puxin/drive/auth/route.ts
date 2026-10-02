import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { buildDriveConsentUrl } from '@/lib/puxin/drive';
import { driveOauthOrigin } from '@/lib/puxin/oauth-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const origin = driveOauthOrigin(new URL(request.url).origin);
    const state = randomBytes(32).toString('hex');
    const response = NextResponse.redirect(buildDriveConsentUrl(origin, state));
    response.cookies.set('puxin-drive-state', state, { httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https:'), maxAge: 600, path: '/' });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
