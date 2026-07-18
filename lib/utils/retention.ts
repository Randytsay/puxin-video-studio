// Age-based cleanup for the runtime-written directories under public/uploads.
//
// Uploads and render outputs are written into the statically-served tree and
// nothing ever removed them, so disk use only grew — every upload (up to
// 100MB) and every output-*.mp4 persisted forever. These helpers give those
// directories a TTL.
//
// Deliberately best-effort: a sweep failure must never turn a successful
// upload or render into an error response.

import { readdir, stat, unlink } from 'fs/promises';
import path from 'path';
import { logError } from './logger';

/** Files the sweep must never remove regardless of age. */
const PRESERVED = new Set(['.gitkeep']);

export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SweepOptions {
  dir: string;
  maxAgeMs: number;
  now?: number;
}

/**
 * Delete regular files in `dir` last modified more than `maxAgeMs` ago.
 * Subdirectories and preserved files are left alone. Returns the number of
 * files actually removed; never throws.
 */
export async function sweepDirectory({
  dir,
  maxAgeMs,
  now = Date.now(),
}: SweepOptions): Promise<number> {
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0; // directory absent — nothing to sweep
  }

  for (const entry of entries) {
    if (PRESERVED.has(entry)) continue;
    const full = path.join(dir, entry);
    try {
      const info = await stat(full);
      if (!info.isFile()) continue;
      if (now - info.mtimeMs <= maxAgeMs) continue;
      await unlink(full);
      removed += 1;
    } catch {
      // Raced with another sweep or a live write; skip this entry.
    }
  }
  return removed;
}

const UPLOAD_SUBDIRS = ['image', 'audio', 'video', 'output'] as const;

/**
 * Retention is OPT-IN: with UPLOAD_RETENTION_DAYS unset, nothing is ever
 * deleted. This directory holds real user media that is gitignored, so a
 * default-on TTL silently destroys data that cannot be recovered from the
 * repo — deleting by default is not a safe default at any TTL.
 */
function maxAgeFromEnv(): number | null {
  const raw = process.env.UPLOAD_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === '') return null;
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) return null;
  return days * 24 * 60 * 60 * 1000;
}

// Sweeping on every request would stat hundreds of files per upload, so the
// sweep is throttled and only one runs at a time.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // at most hourly
let lastSweepAt = 0;
let inFlight: Promise<void> | null = null;

/**
 * Opportunistically expire old uploads and render outputs. Safe to call on
 * every request: it throttles itself, coalesces concurrent callers, and
 * resolves even when the sweep fails.
 *
 * No-op unless UPLOAD_RETENTION_DAYS is set to a positive number — see
 * maxAgeFromEnv. DEFAULT_MAX_AGE_MS is only a suggested value for operators
 * choosing a TTL; it is not applied on its own.
 */
export function sweepUploadsInBackground(now: number = Date.now()): Promise<void> {
  const maxAgeMs = maxAgeFromEnv();
  if (maxAgeMs === null) return Promise.resolve(); // opt-in; disabled by default
  if (inFlight) return inFlight;
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return Promise.resolve();
  lastSweepAt = now;

  const base = path.join(process.cwd(), 'public', 'uploads');

  inFlight = (async () => {
    for (const sub of UPLOAD_SUBDIRS) {
      try {
        await sweepDirectory({ dir: path.join(base, sub), maxAgeMs, now });
      } catch (err) {
        logError(`[retention] sweep failed for ${sub}:`, err);
      }
    }
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Test seam: forget the throttle so a subsequent call sweeps immediately. */
export function resetSweepThrottleForTests(): void {
  lastSweepAt = 0;
  inFlight = null;
}
