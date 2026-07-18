import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import path from 'path';
import { bundle } from '@remotion/bundler';
import {
  selectComposition,
  renderMedia,
  makeCancelSignal,
} from '@remotion/renderer';

// Remotion throws this exact message from renderMedia() when its cancelSignal
// fires. The helper `isUserCancelledRender` is internal (not re-exported from
// the package root in 4.0.x), so we match on the message directly.
function isUserCancelledRender(err: unknown): boolean {
  return (
    err instanceof Error &&
    typeof err.message === 'string' &&
    err.message.includes('renderMedia() got cancelled')
  );
}
import type { VideoClip, Subtitle, VideoResolution, VideoAspectRatio } from '@/src/types';
import { createRateLimiter, getClientIp } from './rate-limit';
import { sweepUploadsInBackground } from '@/lib/utils/retention';

// Default location where Remotion caches the Chrome headless shell. If this
// directory exists we can assume the browser is already downloaded and shrink
// the progress bar budget allocated to the first-run download phase.
const REMOTION_BROWSER_CACHE_DIR = path.join(
  process.cwd(),
  'node_modules',
  '.remotion',
  'chrome-headless-shell',
);

const REMOTION_ENTRY_POINT = path.join(process.cwd(), 'src', 'Root.tsx');

// A fixed output directory for the webpack bundle. Without `outDir`, Remotion
// mkdtemp()s a fresh `remotion-webpack-bundle-*` under os.tmpdir() on every
// call and never removes it, so each render leaked tens of MB until reboot —
// on top of paying for a full webpack rebuild per request.
const REMOTION_BUNDLE_OUT_DIR = path.join(
  process.cwd(),
  'node_modules',
  '.cache',
  'remotion-bundle',
);

let bundlePromise: Promise<string> | null = null;

function getRemotionBundle(): Promise<string> {
  // In development, always rebuild so edits under src/ are picked up — the
  // fixed outDir means we overwrite in place rather than accumulate.
  if (process.env.NODE_ENV === 'development') {
    return bundle({
      entryPoint: REMOTION_ENTRY_POINT,
      outDir: REMOTION_BUNDLE_OUT_DIR,
    });
  }
  // Elsewhere the composition source is immutable for the life of the process,
  // so compile once and share. Memoizing the promise (not the result) also
  // collapses concurrent first requests into a single build.
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: REMOTION_ENTRY_POINT,
      outDir: REMOTION_BUNDLE_OUT_DIR,
    }).catch((err) => {
      bundlePromise = null; // never cache a failed build
      throw err;
    });
  }
  return bundlePromise;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// --- Rate limiting ----------------------------------------------------------
// Render is CPU/memory-heavy (Chromium + ffmpeg). Two-layer protection:
//   1. Per-IP sliding window: cap how often a single client can trigger renders.
//   2. Global concurrency: cap total in-flight renders across all clients so
//      one render can't be starved by parallel sibling renders.
// In-memory state is fine for the self-hosted / single-instance deployment
// model this project targets. For multi-instance deployments, front with a
// reverse-proxy rate limiter or swap in Redis.

const MAX_CONCURRENT_RENDERS = Math.max(
  1,
  Number(process.env.RENDER_MAX_CONCURRENT ?? 1),
);
const RATE_LIMIT_WINDOW_MS = Math.max(
  1000,
  Number(process.env.RENDER_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000),
);
const RATE_LIMIT_MAX = Math.max(
  1,
  Number(process.env.RENDER_RATE_LIMIT_MAX ?? 10),
);
let activeRenders = 0;
const rateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
});

interface RenderBody {
  clips: VideoClip[];
  subtitles?: Subtitle[];
  bgmUrl?: string | null;
  bgmVolume?: number;
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
  productName?: string;
  audioEnabled?: boolean;
}

// NDJSON progress events streamed from /api/render.
// The final event is either `done` or `error`.
type ProgressPhase =
  | 'bundling'
  | 'browserDownload'
  | 'selectingComposition'
  | 'rendering';

type RenderEvent =
  | { type: 'progress'; phase: ProgressPhase; progress: number; message: string }
  | { type: 'done'; videoUrl: string; filename: string }
  | { type: 'error'; error: string };

/**
 * Hosts the renderer may fetch absolute URLs from, beyond its own origin.
 * Comma-separated, e.g. RENDER_ALLOWED_MEDIA_HOSTS="cdn.example.com,img.example.com".
 * Empty by default: absolute URLs are rejected unless explicitly allowed.
 */
const ALLOWED_MEDIA_HOSTS = (process.env.RENDER_ALLOWED_MEDIA_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

/**
 * Resolve a client-supplied media reference into a URL the headless browser is
 * allowed to fetch. Returns null when the reference is not permitted.
 *
 * Absolute URLs are gated because inputProps are fetched by Chromium from the
 * *server's* network position: an unfiltered `http://169.254.169.254/...` would
 * pull cloud instance metadata into the rendered mp4, which the caller then
 * downloads. Relative paths stay safe — they are pinned to our own origin.
 */
function resolveMediaUrl(url: string | null | undefined, origin: string): string | null {
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
  if (ALLOWED_MEDIA_HOSTS.includes(host)) return parsed.toString();
  return null;
}

export async function POST(request: NextRequest) {
  // Rate-limit / concurrency / body-validation all respond with plain JSON.
  // Once we pass these, we switch to a streaming NDJSON response so the
  // client can display real progress (Chrome download on first run, frame
  // render percentage, etc.) instead of a 30-second silent modal.

  const ip = getClientIp(request);
  const rate = rateLimiter.check(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many render requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }

  if (activeRenders >= MAX_CONCURRENT_RENDERS) {
    return NextResponse.json(
      { error: 'Render server is busy. Try again in a moment.' },
      { status: 503, headers: { 'Retry-After': '30' } },
    );
  }

  let body: RenderBody;
  try {
    body = (await request.json()) as RenderBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { clips, subtitles = [], bgmUrl, bgmVolume, resolution, aspectRatio, productName, audioEnabled = true } = body;

  if (!Array.isArray(clips) || clips.length === 0) {
    return NextResponse.json({ error: 'clips is required and must be non-empty' }, { status: 400 });
  }
  if (!resolution || !aspectRatio) {
    return NextResponse.json({ error: 'resolution and aspectRatio are required' }, { status: 400 });
  }

  const origin = request.nextUrl.origin;

  // Reject rather than silently drop: a disallowed URL that resolved to null
  // would render a blank frame or a silent clip with no explanation.
  const rejected: string[] = [];
  const resolveOrReject = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const resolved = resolveMediaUrl(url, origin);
    if (!resolved) rejected.push(url);
    return resolved;
  };

  const resolvedClips = clips.map((clip) => ({
    ...clip,
    imageUrl: resolveOrReject(clip.imageUrl),
    audioUrl: resolveOrReject(clip.audioUrl) || '',
  }));
  const resolvedBgmUrl = resolveOrReject(bgmUrl);

  if (rejected.length > 0) {
    return NextResponse.json(
      {
        error:
          'Media URLs must be same-origin or an allowed host. Disallowed: ' +
          rejected.slice(0, 5).join(', '),
      },
      { status: 400 },
    );
  }

  const compositionId = `ProductVideo-${resolution}-${aspectRatio.replace(':', '-')}`;
  const inputProps = {
    clips: resolvedClips,
    productName,
    resolution,
    aspectRatio,
    audioEnabled,
    subtitles,
    bgmUrl: resolvedBgmUrl,
    bgmVolume: bgmVolume ?? 0.3,
  };

  const outputName = `output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
  const outputLocation = path.join(process.cwd(), 'public', 'uploads', 'output', outputName);

  activeRenders++;
  const encoder = new TextEncoder();

  // Progress bar budget. Determined once per request, not hardcoded.
  //
  // Phase layout (all sum to 100):
  //   bundling / composition prelude  →  PRELUDE (fixed, short)
  //   browser download                →  BROWSER (0 if already cached)
  //   renderMedia (frames + encode)   →  RENDER  (whatever's left)
  //
  // Skipping the browser phase entirely when cached avoids the bug where the
  // bar jumps from 8% → 90% in an instant on cached runs.
  const PRELUDE = 8;
  const BROWSER = existsSync(REMOTION_BROWSER_CACHE_DIR) ? 0 : 72;
  const RENDER = 100 - PRELUDE - BROWSER;
  const RENDER_START = PRELUDE + BROWSER;

  // Propagated into renderMedia so that a client disconnect can abort the
  // heavy frame-rendering phase instead of leaving it running to completion.
  const { cancelSignal, cancel: cancelRender } = makeCancelSignal();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: RenderEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          // Client disconnected. Ignore further sends.
          closed = true;
        }
      };

      try {
        send({
          type: 'progress',
          phase: 'bundling',
          progress: 2,
          message: 'Preparing render engine…',
        });
        const bundled = await getRemotionBundle();

        send({
          type: 'progress',
          phase: 'selectingComposition',
          progress: PRELUDE,
          message: 'Loading composition…',
        });

        const composition = await selectComposition({
          serveUrl: bundled,
          id: compositionId,
          inputProps,
          // First-run Chrome Headless Shell download (~90MB). Without progress
          // reporting this is the infamous 30-second silent freeze. When the
          // binary is already cached BROWSER is 0 and this callback never
          // fires, so the bar stays at PRELUDE until rendering starts.
          onBrowserDownload: () => ({
            version: null,
            onProgress: ({ percent }) => {
              const pct = Math.max(0, Math.min(100, Math.round((percent ?? 0) * 100)));
              send({
                type: 'progress',
                phase: 'browserDownload',
                progress: PRELUDE + Math.round((pct * BROWSER) / 100),
                message: `Downloading render engine… ${pct}% (first time only)`,
              });
            },
          }),
        });

        send({
          type: 'progress',
          phase: 'rendering',
          progress: RENDER_START,
          message: 'Rendering frames…',
        });

        await renderMedia({
          composition,
          serveUrl: bundled,
          codec: 'h264',
          outputLocation,
          inputProps,
          cancelSignal,
          onProgress: ({ progress }) => {
            // Remotion progress is 0..1 across encode+render.
            const pct = Math.max(0, Math.min(100, Math.round((progress ?? 0) * 100)));
            send({
              type: 'progress',
              phase: 'rendering',
              progress: RENDER_START + Math.round((pct * RENDER) / 100),
              message: `Rendering frames… ${pct}%`,
            });
          },
        });

        send({
          type: 'done',
          videoUrl: `/uploads/output/${outputName}`,
          filename: outputName,
        });
      } catch (err) {
        if (isUserCancelledRender(err)) {
          // Client disconnected; renderMedia aborted cleanly. Not a failure.
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        send({ type: 'error', error: `Render failed: ${message}` });
      } finally {
        activeRenders--;
        // Expire old uploads/outputs. Self-throttling; not awaited so it
        // cannot hold the stream open.
        void sweepUploadsInBackground();
        if (!closed) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      // Client aborted the fetch. Abort renderMedia via its cancelSignal so
      // we don't burn CPU/memory finishing a video nobody will watch.
      // bundle() and selectComposition() do not accept cancelSignal in the
      // current Remotion API — they will still run to completion — but those
      // phases are short compared to renderMedia.
      try {
        cancelRender();
      } catch {
        /* already cancelled or not yet armed */
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
