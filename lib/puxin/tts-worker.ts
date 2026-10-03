import { getProject, saveProject } from './projects';
import { synthesizeNarration } from './tts';
import {
  claimQueuedTtsJob,
  getTtsJob,
  nextQueuedTtsJobs,
  recoverTtsJobsAfterRestart,
  updateTtsJob,
} from './tts-jobs';

const globals = globalThis as typeof globalThis & {
  puxinTtsWorker?: { working: boolean; initialized: boolean };
};
const state = globals.puxinTtsWorker ??= { working: false, initialized: false };

function fail(id: string, error: unknown) {
  updateTtsJob(id, {
    status: 'failed',
    progress: 100,
    error: error instanceof Error ? error.message.slice(0, 1200) : '批次旁白生成失敗',
  });
}

async function processOne(id: string) {
  const job = getTtsJob(id);
  if (!job || job.status !== 'running') return;
  if (job.cursor >= job.total) {
    updateTtsJob(id, { status: 'done', progress: 100, error: null });
    return;
  }

  const target = job.input.targets[job.cursor];
  const project = getProject(job.projectId);
  if (!project) throw new Error('找不到作品');
  const clip = project.project.clips[target.index];

  if (!clip || clip.text.trim() !== target.text || clip.audioUrl) {
    const cursor = job.cursor + 1;
    updateTtsJob(id, {
      cursor,
      progress: Math.round((cursor / job.total) * 100),
      ...(cursor >= job.total ? { status: 'done' as const } : {}),
    });
    return;
  }

  const result = await synthesizeNarration({
    text: target.text,
    voice: job.input.voice,
    style: job.input.style,
  });

  const latest = getProject(job.projectId);
  if (!latest) throw new Error('找不到作品');
  const latestClip = latest.project.clips[target.index];
  if (latestClip?.text.trim() === target.text && !latestClip.audioUrl) {
    saveProject({
      id: latest.id,
      revision: latest.revision,
      title: latest.title,
      project: {
        ...latest.project,
        clips: latest.project.clips.map((item, index) => index === target.index
          ? {
              ...item,
              audioUrl: result.audioUrl,
              audioStartTime: 0,
              duration: Math.round((result.duration + 0.6) * 100) / 100,
            }
          : item),
      },
      voice: latest.voice,
      voiceStyle: latest.voiceStyle,
    });
  }

  const cursor = job.cursor + 1;
  updateTtsJob(id, {
    cursor,
    progress: Math.round((cursor / job.total) * 100),
    ...(cursor >= job.total ? { status: 'done' as const } : {}),
    error: null,
  });
}

async function tick() {
  const queued = nextQueuedTtsJobs(1)[0];
  if (!queued || !claimQueuedTtsJob(queued.id)) return;
  try {
    await processOne(queued.id);
    const current = getTtsJob(queued.id);
    if (current?.status === 'running') updateTtsJob(queued.id, { status: 'queued' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('另一個視窗')) {
      updateTtsJob(queued.id, { status: 'queued', error: null });
      return;
    }
    fail(queued.id, error);
  }
}

export function startTtsWorker() {
  if (!state.initialized) {
    state.initialized = true;
    recoverTtsJobsAfterRestart();
  }
  if (state.working) return;
  state.working = true;
  void tick()
    .catch(error => console.error('Puxin TTS worker:', error instanceof Error ? error.message : error))
    .finally(() => { state.working = false; });
}
