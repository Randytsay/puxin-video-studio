import path from 'node:path';
import { mkdir, realpath } from 'node:fs/promises';

export function dataRoot() {
  return path.resolve(process.env.PUXIN_DATA_DIR || path.join(process.cwd(), '.data', 'studio'));
}
export function mediaRoot() { return path.join(dataRoot(), 'media'); }
export async function mediaPath(key: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(key) || key.split('/').some(p => p === '..' || p === '.')) throw new Error('無效的素材路徑');
  const root = mediaRoot();
  await mkdir(root, { recursive: true });
  const target = path.resolve(root, key);
  if (!target.startsWith(root + path.sep)) throw new Error('無效的素材路徑');
  return target;
}
export async function existingMediaPath(key: string) {
  const target = await realpath(await mediaPath(key));
  const root = await realpath(mediaRoot());
  if (!target.startsWith(root + path.sep)) throw new Error('無效的素材路徑');
  return target;
}
export function mediaUrl(key: string) { return `/api/puxin/media/${key}`; }
