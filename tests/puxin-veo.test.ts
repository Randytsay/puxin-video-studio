import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chooseVeoDurationSeconds, resolvePuxinImagePath, resolveVeoImagePath } from '@/lib/puxin/veo';

let tempRoot = '';
afterEach(async () => {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = '';
  delete process.env.PUXIN_DATA_DIR;
});

describe('Puxin Veo helpers', () => {
  it('rounds a scene duration up to a supported Veo duration', () => {
    expect(chooseVeoDurationSeconds(3.2)).toBe(4);
    expect(chooseVeoDurationSeconds(4.4)).toBe(6);
    expect(chooseVeoDurationSeconds(7)).toBe(8);
    expect(chooseVeoDurationSeconds(Number.NaN)).toBe(4);
  });

  it('accepts only imported Puxin scene images', () => {
    expect(resolvePuxinImagePath('/uploads/image/puxin/scene.png')).toContain('/public/uploads/image/puxin/scene.png');
    expect(() => resolvePuxinImagePath('/uploads/image/other.png')).toThrow(/only accepts imported Puxin/i);
    expect(() => resolvePuxinImagePath('/uploads/image/puxin/../../secret.png')).toThrow(/outside/i);
  });

  it('accepts persisted V1 studio images through the protected media store', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'puxin-veo-'));
    process.env.PUXIN_DATA_DIR = tempRoot;
    const imageDir = path.join(tempRoot, 'media', 'image');
    await mkdir(imageDir, { recursive: true });
    const file = path.join(imageDir, 'scene.png');
    await writeFile(file, Buffer.from('test'));
    await expect(resolveVeoImagePath('/api/puxin/media/image/scene.png')).resolves.toBe(await realpath(file));
  });
});
