import { NextRequest, NextResponse } from 'next/server';
import { validateProject, type ValidationIssue } from '@/lib/project/validate';
import { getRenderOrigin, resolveMediaUrl, collectMediaRefs } from '@/lib/project/media';

// Headless entry point for programmatic callers (scripts, CI, LLM agents):
// dry-run a project JSON against the same rules /api/render enforces —
// structure, resource ceilings, AND the media-origin policy — without
// spending a render. A 200 from here is a guarantee that /api/render will
// accept the same body. Cheap and unauthenticated by design — it touches no
// filesystem state and spawns no browser, so it needs none of the render
// route's rate limiting.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        errors: [{ path: '', message: 'Request body must be valid JSON' }],
        warnings: [],
      },
      { status: 400 },
    );
  }

  const result = validateProject(body);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, errors: result.errors, warnings: result.warnings },
      { status: 422 },
    );
  }

  // Same media-origin policy as /api/render, reported per field so the
  // caller knows exactly which reference to fix.
  const origin = getRenderOrigin();
  const mediaErrors: ValidationIssue[] = collectMediaRefs(result.project)
    .filter((ref) => resolveMediaUrl(ref.url, origin) === null)
    .map((ref) => ({
      path: ref.path,
      message:
        `"${ref.url}" is not an allowed media URL. Use a same-origin path ` +
        '(e.g. /uploads/image/… as returned by POST /api/upload) or a host ' +
        'listed in RENDER_ALLOWED_MEDIA_HOSTS.',
    }));
  if (mediaErrors.length > 0) {
    return NextResponse.json(
      { ok: false, errors: mediaErrors, warnings: result.warnings },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    warnings: result.warnings,
    summary: result.summary,
    schema: '/schema/project.schema.json',
  });
}
