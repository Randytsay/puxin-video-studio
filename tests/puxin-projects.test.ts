import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveProject, getProject, createJob, listJobs, updateJob } from '@/lib/puxin/projects';
let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), 'puxin-project-test-')); process.env.PUXIN_DATA_DIR = dir; });
afterEach(() => { delete process.env.PUXIN_DATA_DIR; rmSync(dir, { recursive: true, force: true }); });
const project = { clips: [{ plotName: '完整原圖', text: '停一下', imageUrl: '/api/puxin/media/image/test.png', audioUrl: '', duration: 4, index: 0, sceneLayout: 'contain', showSceneSubtitle: false }], subtitles: [], resolution: '1080p', aspectRatio: '3:4', brand: { enabled: true, closingText: '普新精舍' } };
describe('persistent Puxin works', () => {
  it('preserves the ratio, brand and scene across reload and rejects stale saves', () => {
    const a = saveProject({ title: '水壺', project });
    expect(getProject(a.id)?.project).toMatchObject({ aspectRatio: '3:4', brand: { enabled: true }, clips: [{ sceneLayout: 'contain' }] });
    const b = saveProject({ ...a, title: '水壺修訂' });
    expect(b.revision).toBe(2);
    expect(() => saveProject({ ...a, title: '舊視窗' })).toThrow('另一個視窗');
    expect(getProject(a.id)?.title).toBe('水壺修訂');
  });
  it('captures a render snapshot and retains the local result after upload fails', () => {
    const a = saveProject({ title: '水壺', project }); const job = createJob(a);
    expect(createJob(a).id).toBe(job.id);
    saveProject({ ...a, title: '之後的內容' });
    updateJob(job.id, { status: 'done', videoUrl: '/api/puxin/media/output/test.mp4', syncError: '需要授权' });
    const saved = listJobs(a.id)[0];
    expect(saved.snapshot.title).toBe('水壺'); expect(saved.videoUrl).toContain('test.mp4'); expect(saved.status).toBe('done');
  });
  it('rejects external media before it reaches the render worker', () => {
    expect(() => saveProject({ title: '拒絕', project: { ...project, clips: [{ ...project.clips[0], imageUrl: 'http://169.254.169.254/' }] } })).toThrow('已匯入');
  });
});
