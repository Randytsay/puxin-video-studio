import { activeVeoJobs, claimQueuedAiJob, getAiJob, nextQueuedAiJobs, recoverAiJobsAfterRestart, updateAiJob } from './ai-jobs';
import { runH3Generation } from './h3';
import { pollPuxinVeoGeneration, submitPuxinVeoGeneration, type VeoDurationSeconds } from './veo';

const globals = globalThis as typeof globalThis & {
  puxinAiWorker?: { working: boolean; initialized: boolean; h3Running: Set<string> };
};
const state = globals.puxinAiWorker ??= { working: false, initialized: false, h3Running: new Set<string>() };

function fail(id: string, error: unknown) {
  updateAiJob(id, {
    status: 'failed',
    progress: 100,
    error: error instanceof Error ? error.message.slice(0, 1200) : 'AI 動態化失敗',
  });
}

async function pollVeoJobs() {
  for (const job of activeVeoJobs()) {
    if (!job.externalId) {
      updateAiJob(job.id, { status: 'queued', progress: 0, error: null });
      continue;
    }
    try {
      const result = await pollPuxinVeoGeneration(job.externalId);
      if (!result.done) {
        updateAiJob(job.id, { progress: Math.min(90, Math.max(12, job.progress + 2)) });
        continue;
      }
      if (result.error || !result.videoUrl) {
        fail(job.id, new Error(result.error || 'Veo 完成但沒有取得影片'));
        continue;
      }
      updateAiJob(job.id, { status: 'done', progress: 100, videoUrl: result.videoUrl, error: null });
    } catch (error) {
      // Keep transient polling failures resumable. Permanent provider failures are returned as done+error above.
      console.error('Puxin Veo poll:', error instanceof Error ? error.message : error);
    }
  }
}

async function submitVeo(id: string) {
  const job = getAiJob(id);
  if (!job) return;
  try {
    const result = await submitPuxinVeoGeneration({
      imageUrl: job.input.imageUrl,
      durationSeconds: job.input.durationSeconds as VeoDurationSeconds,
      prompt: job.input.prompt,
      storyContext: job.input.storyContext,
    });
    updateAiJob(id, { status: 'running', progress: 10, externalId: result.operationName, error: null });
  } catch (error) {
    fail(id, error);
  }
}

function startH3(id: string) {
  if (state.h3Running.size >= 1) {
    updateAiJob(id, { status: 'queued', progress: 0 });
    return;
  }
  const job = getAiJob(id);
  if (!job) return;
  state.h3Running.add(id);
  updateAiJob(id, { status: 'running', progress: 5, externalId: id, error: null });
  void runH3Generation(job.input, {
    jobId: id,
    onProgress: progress => updateAiJob(id, { progress }),
  }).then(result => {
    updateAiJob(id, { status: 'done', progress: 100, videoUrl: result.videoUrl, error: null });
  }).catch(error => fail(id, error)).finally(() => {
    state.h3Running.delete(id);
  });
}

async function tick() {
  await pollVeoJobs();
  for (const queued of nextQueuedAiJobs(3)) {
    if (!claimQueuedAiJob(queued.id)) continue;
    if (queued.provider === 'vertex-veo-3.1') await submitVeo(queued.id);
    else startH3(queued.id);
  }
}

export function startAiWorker() {
  if (!state.initialized) {
    state.initialized = true;
    recoverAiJobsAfterRestart();
  }
  if (state.working) return;
  state.working = true;
  void tick()
    .catch(error => console.error('Puxin AI worker:', error instanceof Error ? error.message : error))
    .finally(() => { state.working = false; });
}
