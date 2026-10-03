import { signRenderMedia } from './media-auth';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { database, getJob, updateJob, type StudioJob } from './projects';
import { mediaPath, mediaUrl } from './paths';
import { getRenderOrigin } from '@/lib/project/media';
const renderOrigin = () => process.env.PUXIN_RENDER_ORIGIN || getRenderOrigin();
import { uploadJobToDrive } from './drive-output';

const globals = globalThis as typeof globalThis & { puxinWorker?: { working: boolean; initialized: boolean; cachedBundle?: Promise<string> } };
const state = globals.puxinWorker ??= { working: false, initialized: false };
export function startRenderWorker() {
  if (!state.initialized) {
    state.initialized = true;
    // Single server deployment: a restart invalidates the old render process.
    database().prepare("UPDATE jobs SET status='queued',progress=0,error=NULL WHERE status='rendering'").run();
  }
  if (state.working) return;
  state.working = true;
  void drain().catch(error => console.error('Puxin worker:', error instanceof Error ? error.message : 'failed')).finally(() => { state.working = false; });
}
async function drain() {
  while (true) {
    const row = database().prepare("SELECT id FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get();
    if (!row) return;
    const id = String(row.id);
    if (!database().prepare("UPDATE jobs SET status='rendering' WHERE id=? AND status='queued'").run(id).changes) continue;
    const job = getJob(id)!;
    try {
      await render(job);
      try { await uploadJobToDrive(getJob(id)!, renderOrigin()); } catch { /* local result is successful even when Drive needs authorization */ }
    } catch (error) { updateJob(id, { status: 'failed', error: error instanceof Error ? error.message : '匯出失敗' }); }
  }
}
async function render(job: StudioJob) {
  const origin = renderOrigin();
  const input = job.snapshot.project;
  const resolve = (url: string | null | undefined) => url ? signRenderMedia(url, origin) : null;
  const inputProps = { ...input, clips: input.clips.map(c => ({ ...c, imageUrl: resolve(c.imageUrl), audioUrl: resolve(c.audioUrl) || '' })), bgmUrl: resolve(input.bgmUrl) };
  const bundleDir = path.resolve(process.env.PUXIN_RENDER_CACHE_DIR || path.join(process.cwd(), 'node_modules/.cache/puxin-render'));
  if (!state.cachedBundle) state.cachedBundle = bundle({ entryPoint: path.join(process.cwd(), 'src/Root.tsx'), outDir: bundleDir }).catch(error => { state.cachedBundle = undefined; throw error; });
  updateJob(job.id, { progress: 3 });
  const serveUrl = await state.cachedBundle;
  const composition = await selectComposition({ serveUrl, id: `ProductVideo-${input.resolution}-${input.aspectRatio.replace(':', '-')}`, inputProps });
  const key = `output/${job.id}.mp4`; const output = await mediaPath(key);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(await mediaPath(`output/${job.id}.json`), JSON.stringify(job.snapshot, null, 2));
  await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: output, inputProps, concurrency: Math.max(1, Number(process.env.PUXIN_RENDER_CONCURRENCY || 1)), onProgress: ({ progress }) => updateJob(job.id, { progress: Math.round(8 + progress * 90) }) });
  updateJob(job.id, { status: 'done', progress: 100, videoUrl: mediaUrl(key), error: null });
}
