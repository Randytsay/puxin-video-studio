import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

afterEach(() => vi.unstubAllEnvs());

it('rejects H3 when external runner is not configured', async () => {
  vi.stubEnv('MINIMAX_H3_RUNNER_PATH', '');
  const { submitH3Generation } = await import('@/lib/puxin/h3');
  await expect(submitH3Generation({ imageUrl: '/api/puxin/media/image/a.png', durationSeconds: 8 })).rejects.toThrow('runner');
});

it('validates H3 duration before starting external work', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'puxin-h3-'));
  try {
    const runner = path.join(root, 'runner.py');
    await writeFile(runner, '# test');
    vi.stubEnv('MINIMAX_H3_RUNNER_PATH', runner);
    vi.stubEnv('PUXIN_DATA_DIR', root);
    await mkdir(path.join(root, 'media', 'image'), { recursive: true });
    await writeFile(path.join(root, 'media', 'image', 'a.png'), Buffer.from('x'));
    const { submitH3Generation } = await import('@/lib/puxin/h3');
    await expect(submitH3Generation({ imageUrl: '/api/puxin/media/image/a.png', durationSeconds: 3 })).rejects.toThrow('4–15');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
