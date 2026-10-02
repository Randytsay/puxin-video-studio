import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Apply baseline security headers to every response. Self-hosters can fork this
// file to tighten or relax policies for their environment.
function applySecurityHeaders(response: NextResponse) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  // '1; mode=block' is deprecated and its filter has its own injection issues.
  // Modern guidance is to disable the legacy auditor and rely on CSP.
  response.headers.set('X-XSS-Protection', '0');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  // 'unsafe-eval' / 'unsafe-inline' are kept because Next.js dev mode and the
  // Remotion preview emit inline scripts/styles. Tighten in production behind a
  // strict-CSP-aware deployment if needed.
  // With 'unsafe-inline' retained, the directives below are what actually
  // constrain an injection: without object-src/base-uri/form-action an
  // injected <base href> or <object> is completely unmitigated.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

/**
 * Both mutating routes are unauthenticated and accept CORS-simple requests:
 * /api/upload takes multipart/form-data, and /api/render reads request.json()
 * without checking Content-Type. Either can therefore be triggered by any page
 * the victim visits, with no preflight to stop it.
 *
 * We reject only an explicit `Sec-Fetch-Site: cross-site`/`same-site` — which
 * is exactly the browser-initiated cross-origin case — rather than requiring
 * the header to be present. Non-browser clients (curl, CI, the test suite)
 * omit it entirely and must keep working.
 */
function isCrossSiteMutation(request: NextRequest): boolean {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return false;
  }
  const site = request.headers.get('sec-fetch-site');
  return site === 'cross-site' || site === 'same-site';
}

function requiresBasicAuth(request: NextRequest): boolean {
  const expected = process.env.PUXIN_BASIC_AUTH_HEADER?.trim();
  if (!expected) return false;
  return request.headers.get('authorization') !== expected;
}

export function proxy(request: NextRequest) {
  if (requiresBasicAuth(request)) {
    const response = NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    response.headers.set('WWW-Authenticate', 'Basic realm="Puxin Video Studio", charset="UTF-8"');
    return applySecurityHeaders(response);
  }
  if (isCrossSiteMutation(request)) {
    return applySecurityHeaders(
      NextResponse.json({ error: 'Cross-site requests are not allowed' }, { status: 403 }),
    );
  }
  return applySecurityHeaders(NextResponse.next());
}

// Skip Next.js internal asset routes — security headers on those add no value
// and the framework already serves them with reasonable defaults.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
