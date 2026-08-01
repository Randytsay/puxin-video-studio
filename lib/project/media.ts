// Media-origin policy — which URLs the renderer is allowed to fetch.
//
// Shared by /api/render (enforcement) and /api/project/validate (dry-run),
// so a project that passes validation is guaranteed not to be rejected by
// the render endpoint. Everything here derives from configuration only —
// never from the incoming request — see getRenderOrigin for why.

/**
 * The origin the renderer treats as "ours" — deliberately derived from
 * configuration, never from the request.
 *
 * `request.nextUrl.origin` is built from the `Host` header whenever Next runs
 * behind a trusted proxy (always true on Vercel, see `trustHostHeader`), so
 * anchoring the allowlist to it let a caller send `Host: 169.254.169.254` and
 * have their own host approved as same-origin — defeating the check below
 * entirely. Set NEXT_PUBLIC_BASE_URL in any deployment where uploads are not
 * served from localhost.
 */
export function getRenderOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Misconfigured value: fall through to the localhost default rather than
      // silently trusting an unparseable string.
    }
  }
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * Hosts the renderer may fetch absolute URLs from, beyond its own origin.
 * Comma-separated, e.g. RENDER_ALLOWED_MEDIA_HOSTS="cdn.example.com,img.example.com".
 * Empty by default: absolute URLs are rejected unless explicitly allowed.
 * Read per call so tests and long-lived processes see env changes.
 */
function allowedMediaHosts(): string[] {
  return (process.env.RENDER_ALLOWED_MEDIA_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Resolve a client-supplied media reference into a URL the headless browser is
 * allowed to fetch. Returns null when the reference is not permitted.
 *
 * Absolute URLs are gated because inputProps are fetched by Chromium from the
 * *server's* network position: an unfiltered `http://169.254.169.254/...` would
 * pull cloud instance metadata into the rendered mp4, which the caller then
 * downloads. Relative paths stay safe — they are pinned to our own origin.
 */
export function resolveMediaUrl(url: string | null | undefined, origin: string): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return `${origin}${url}`;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.toLowerCase();
  if (host === new URL(origin).hostname.toLowerCase()) return parsed.toString();
  if (allowedMediaHosts().includes(host)) return parsed.toString();
  return null;
}

export interface MediaRef {
  /** JSON-path-ish location, e.g. "clips[2].imageUrl". */
  path: string;
  url: string;
}

/**
 * Every media reference in a project, with its location — so policy failures
 * can be reported against the exact field that caused them.
 */
export function collectMediaRefs(project: {
  clips: ReadonlyArray<{ imageUrl?: string | null; audioUrl?: string }>;
  bgmUrl?: string | null;
}): MediaRef[] {
  const refs: MediaRef[] = [];
  project.clips.forEach((clip, i) => {
    if (clip.imageUrl) refs.push({ path: `clips[${i}].imageUrl`, url: clip.imageUrl });
    if (clip.audioUrl) refs.push({ path: `clips[${i}].audioUrl`, url: clip.audioUrl });
  });
  if (project.bgmUrl) refs.push({ path: 'bgmUrl', url: project.bgmUrl });
  return refs;
}
