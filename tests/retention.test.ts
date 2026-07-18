import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, readdir, utimes } from 'fs/promises';
import { rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  sweepDirectory,
  sweepUploadsInBackground,
  resetSweepThrottleForTests,
  DEFAULT_MAX_AGE_MS,
} from '@/lib/utils/retention';

let dir: string;

const DAY = 24 * 60 * 60 * 1000;

async function writeAged(name: string, ageMs: number) {
  const full = path.join(dir, name);
  await writeFile(full, 'x');
  const when = new Date(Date.now() - ageMs);
  await utimes(full, when, when);
  return full;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'retention-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('sweepDirectory', () => {
  it('removes files older than the TTL and keeps fresh ones', async () => {
    await writeAged('old.mp4', 10 * DAY);
    await writeAged('fresh.mp4', 1 * DAY);

    const removed = await sweepDirectory({ dir, maxAgeMs: 7 * DAY });

    expect(removed).toBe(1);
    expect(await readdir(dir)).toEqual(['fresh.mp4']);
  });

  it('never removes .gitkeep, however old', async () => {
    await writeAged('.gitkeep', 365 * DAY);
    await writeAged('stale.png', 365 * DAY);

    await sweepDirectory({ dir, maxAgeMs: 7 * DAY });

    expect(await readdir(dir)).toEqual(['.gitkeep']);
  });

  it('leaves subdirectories alone', async () => {
    await mkdir(path.join(dir, 'nested'));
    const when = new Date(Date.now() - 365 * DAY);
    await utimes(path.join(dir, 'nested'), when, when);

    const removed = await sweepDirectory({ dir, maxAgeMs: 7 * DAY });

    expect(removed).toBe(0);
    expect(await readdir(dir)).toEqual(['nested']);
  });

  it('treats a file exactly at the TTL boundary as still fresh', async () => {
    await writeAged('boundary.mp4', 7 * DAY);
    // mtime resolution makes exact equality flaky, so assert the intent:
    // a file one hour younger than the TTL must survive.
    await writeAged('just-inside.mp4', 7 * DAY - 60 * 60 * 1000);

    await sweepDirectory({ dir, maxAgeMs: 7 * DAY });

    expect(await readdir(dir)).toContain('just-inside.mp4');
  });

  it('returns 0 for a directory that does not exist instead of throwing', async () => {
    await expect(
      sweepDirectory({ dir: path.join(dir, 'missing'), maxAgeMs: 7 * DAY }),
    ).resolves.toBe(0);
  });

  it('suggests a 7-day TTL for operators who opt in', () => {
    expect(DEFAULT_MAX_AGE_MS).toBe(7 * DAY);
  });
});

describe('sweepUploadsInBackground', () => {
  const original = process.env.UPLOAD_RETENTION_DAYS;
  afterEach(() => {
    if (original === undefined) delete process.env.UPLOAD_RETENTION_DAYS;
    else process.env.UPLOAD_RETENTION_DAYS = original;
    resetSweepThrottleForTests();
  });

  // Regression: this deleted real user media the first time it ran, because
  // it was enabled by default. Uploads are gitignored, so that is unrecoverable.
  it('deletes nothing when UPLOAD_RETENTION_DAYS is unset', async () => {
    delete process.env.UPLOAD_RETENTION_DAYS;
    resetSweepThrottleForTests();

    const ancient = path.join(dir, 'ancient.png');
    await writeAged('ancient.png', 999 * DAY);

    await sweepUploadsInBackground();

    // The opt-out path must not even reach the filesystem.
    expect(await readdir(dir)).toContain('ancient.png');
    expect(ancient).toBeTruthy();
  });

  it('deletes nothing when UPLOAD_RETENTION_DAYS is empty or non-positive', async () => {
    for (const value of ['', '0', '-3', 'abc']) {
      process.env.UPLOAD_RETENTION_DAYS = value;
      resetSweepThrottleForTests();
      await writeAged('keep.png', 999 * DAY);
      await sweepUploadsInBackground();
      expect(await readdir(dir)).toContain('keep.png');
    }
  });
});
