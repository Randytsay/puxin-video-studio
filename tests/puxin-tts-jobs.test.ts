import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveProject } from '@/lib/puxin/projects';
import {
  claimQueuedTtsJob,
  createTtsJob,
  getTtsJob,
  recoverTtsJobsAfterRestart,
  updateTtsJob,
} from '@/lib/puxin/tts-jobs';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'puxin-tts-job-test-'));
  process.env.PUXIN_DATA_DIR = dir;
});
afterEach(() => {
  delete process.env.PUXIN_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
});

const project = {
  clips: [
    { plotName: '一', text: '第一段', imageUrl: '/api/puxin/media/image/1.png', audioUrl: '', duration: 4, index: 0, sceneLayout: 'contain', showSceneSubtitle: false },
    { plotName: '二', text: '第二段', imageUrl: '/api/puxin/media/image/2.png', audioUrl: '/api/puxin/media/audio/2.wav', duration: 4, index: 1, sceneLayout: 'contain', showSceneSubtitle: false },
    { plotName: '三', text: '', imageUrl: '/api/puxin/media/image/3.png', audioUrl: '', duration: 4, index: 2, sceneLayout: 'contain', showSceneSubtitle: false },
  ],
  subtitles: [],
  resolution: '1080p',
  aspectRatio: '3:4',
  brand: { enabled: false, closingText: '' },
};

describe('durable Puxin TTS batch jobs', () => {
  it('snapshots only missing narration and preserves the cursor across restart recovery', () => {
    const saved = saveProject({ title: '背景旁白', project, voice: 'Kore', voiceStyle: '自然台灣華語' });
    const job = createTtsJob({ projectId: saved.id, projectRevision: saved.revision });

    expect(job.total).toBe(1);
    expect(job.input.targets).toEqual([{ index: 0, text: '第一段' }]);
    expect(createTtsJob({ projectId: saved.id, projectRevision: saved.revision }).id).toBe(job.id);

    expect(claimQueuedTtsJob(job.id)).toBe(true);
    updateTtsJob(job.id, { cursor: 1, progress: 100 });
    recoverTtsJobsAfterRestart();

    expect(getTtsJob(job.id)).toMatchObject({
      status: 'queued',
      cursor: 1,
      progress: 100,
      total: 1,
    });
  });
});
