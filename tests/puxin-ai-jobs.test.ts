import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveProject, getProject } from '@/lib/puxin/projects';
import {
  applyAiJob,
  createAiJob,
  getAiJob,
  recoverAiJobsAfterRestart,
  updateAiJob,
} from '@/lib/puxin/ai-jobs';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'puxin-ai-job-test-'));
  process.env.PUXIN_DATA_DIR = dir;
});
afterEach(() => {
  delete process.env.PUXIN_DATA_DIR;
  delete process.env.MINIMAX_H3_RUNNER_PATH;
  rmSync(dir, { recursive: true, force: true });
});

const baseProject = {
  clips: [{
    plotName: '場景一',
    text: '停一下',
    imageUrl: '/api/puxin/media/image/test.png',
    audioUrl: '',
    duration: 4.4,
    index: 0,
    totalClips: 1,
    sceneLayout: 'fit-blur' as const,
    showSceneSubtitle: false,
  }],
  subtitles: [],
  resolution: '1080p' as const,
  aspectRatio: '9:16' as const,
};

describe('durable AI generation jobs', () => {
  it('deduplicates an active job and applies the completed video safely', () => {
    const project = saveProject({ title: '水壺', project: baseProject });
    const first = createAiJob({
      projectId: project.id,
      projectRevision: project.revision,
      clipIndex: 0,
      provider: 'vertex-veo-3.1',
    });
    const duplicate = createAiJob({
      projectId: project.id,
      projectRevision: project.revision,
      clipIndex: 0,
      provider: 'vertex-veo-3.1',
    });
    expect(duplicate.id).toBe(first.id);
    expect(first.input.durationSeconds).toBe(6);

    updateAiJob(first.id, { status: 'done', progress: 100, videoUrl: '/api/puxin/media/video/veo.mp4' });
    const applied = applyAiJob(first.id);
    expect(applied.revision).toBe(project.revision + 1);
    expect(applied.project.clips[0]).toMatchObject({
      imageUrl: '/api/puxin/media/video/veo.mp4',
      imageEffect: 'none',
      sceneLayout: 'cover',
    });
    expect(getAiJob(first.id)?.appliedAt).toBeTruthy();
  });

  it('does not apply a completed result after the source scene has changed', () => {
    const project = saveProject({ title: '水壺', project: baseProject });
    const job = createAiJob({
      projectId: project.id,
      projectRevision: project.revision,
      clipIndex: 0,
      provider: 'vertex-veo-3.1',
    });
    const edited = saveProject({
      ...project,
      project: { ...project.project, clips: [{ ...project.project.clips[0], imageUrl: '/api/puxin/media/image/replaced.png' }] },
    });
    updateAiJob(job.id, { status: 'done', progress: 100, videoUrl: '/api/puxin/media/video/veo.mp4' });
    expect(() => applyAiJob(job.id)).toThrow('場景在生成期間已變更');
    expect(getProject(project.id)?.revision).toBe(edited.revision);
  });

  it('requeues interrupted H3 work after a service restart', () => {
    process.env.MINIMAX_H3_RUNNER_PATH = '/tmp/external-h3-runner.py';
    const project = saveProject({ title: '水壺', project: baseProject });
    const job = createAiJob({
      projectId: project.id,
      projectRevision: project.revision,
      clipIndex: 0,
      provider: 'minimax-h3-colab',
    });
    updateAiJob(job.id, { status: 'running', progress: 44, externalId: job.id });
    recoverAiJobsAfterRestart();
    expect(getAiJob(job.id)).toMatchObject({ status: 'queued', progress: 0, externalId: null, error: null });
  });
});
