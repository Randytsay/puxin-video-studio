// Rate-limiting + client-IP extraction for /api/render.
//
// Pulled out of route.ts so the logic can be unit-tested without booting
// Next.js or Remotion. The route owns one factory-created instance; tests
// create their own with controlled config and a `now()` injection point.

export interface RateLimiterConfig {
  windowMs: number;
  max: number;
  /** Lazily prune the IP map when it grows beyond this size. */
  sweepThreshold?: number;
}

export type RateCheckResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

export interface RateLimiter {
  check(ip: string, now?: number): RateCheckResult;
  /** Test helper: number of distinct IPs currently tracked. */
  size(): number;
}

/**
 * Per-key sliding-window limiter. State is held in an internal Map; create one
 * per logical scope (one for /api/render, etc).
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const windowMs = Math.max(1, config.windowMs);
  const max = Math.max(1, config.max);
  const sweepThreshold = Math.max(1, config.sweepThreshold ?? 1000);
  const log = new Map<string, number[]>();

  return {
    check(ip, now = Date.now()) {
      const cutoff = now - windowMs;

      // Lazy sweep: prune all stale entries whenever the map grows large, so
      // a long-running process facing many unique clients doesn't leak memory.
      if (log.size > sweepThreshold) {
        for (const [key, timestamps] of log) {
          const fresh = timestamps.filter((t) => t > cutoff);
          if (fresh.length === 0) log.delete(key);
          else log.set(key, fresh);
        }
      }

      const history = (log.get(ip) ?? []).filter((t) => t > cutoff);
      if (history.length >= max) {
        const oldest = history[0];
        const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
        log.set(ip, history);
        return { allowed: false, retryAfterSec };
      }
      history.push(now);
      log.set(ip, history);
      return { allowed: true };
    },
    size() {
      return log.size;
    },
  };
}

/**
 * Extract the originating client IP from a Next.js request.
 *
 * Forwarding headers are read ONLY when TRUST_PROXY_HEADERS is set, because
 * any client can send them. Trusting `x-forwarded-for` unconditionally makes
 * the limiter a no-op: an attacker increments a fake IP per request and every
 * call lands in a fresh bucket, on the endpoint that spawns Chromium + ffmpeg.
 *
 * Set TRUST_PROXY_HEADERS=1 only when the app sits behind a reverse proxy that
 * *overwrites* these headers (Vercel, Cloudflare, an ALB you control). When
 * unset, all direct clients share the 'unknown' bucket — a limiter that is too
 * strict under direct exposure, which is the safe direction to fail.
 */
export function getClientIp(request: { headers: Headers }): string {
  // Read per-call rather than at module load so deployments (and tests) can
  // flip it without a rebuild.
  if (process.env.TRUST_PROXY_HEADERS !== '1') return 'unknown';

  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    // Rightmost entry is the one appended by the nearest trusted proxy;
    // everything to its left is client-supplied and forgeable.
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    const nearest = hops[hops.length - 1];
    if (nearest) return nearest;
  }
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}
