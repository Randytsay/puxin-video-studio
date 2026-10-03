import { randomUUID } from 'node:crypto';
import { chooseVeoDurationSeconds } from './veo';
import { database, getProject, saveProject, type StudioProject } from './projects';

export type AiGenerationProvider = 'vertex-veo-3.1' | 'minimax-h3-colab';
export type AiGenerationStatus = 'queued' | 'submitting' | 'running' | 'done' | 'failed';

export interface AiGenerationInput {
  imageUrl: string;
  durationSeconds: number;
  prompt?: string;
  storyContext?: string;
}

export interface AiGenerationJob {
  id: string;
  projectId: string;
  projectRevision: number;
  clipIndex: number;
  provider: AiGenerationProvider;
  status: AiGenerationStatus;
  progress: number;
  sourceImageUrl: string;
  input: AiGenerationInput;
  externalId: string | null;
  videoUrl: string | null;
  error: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Row = Record<string, string | number | null>;

function parseJob(row: Row): AiGenerationJob {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    projectRevision: Number(row.project_revision),
    clipIndex: Number(row.clip_index),
    provider: row.provider as AiGenerationProvider,
    status: row.status as AiGenerationStatus,
    progress: Number(row.progress),
    sourceImageUrl: String(row.source_image_url),
    input: JSON.parse(String(row.input_json)) as AiGenerationInput,
    externalId: row.external_id as string | null,
    videoUrl: row.video_url as string | null,
    error: row.error as string | null,
    appliedAt: row.applied_at as string | null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function isVideo(url: string) {
  const clean = url.split('?')[0].toLowerCase();
  return ['.mp4', '.mov', '.m4v', '.webm', '.ogv'].some(ext => clean.endsWith(ext));
}

export function listAiJobs(projectId?: string): AiGenerationJob[] {
  const rows = projectId
    ? database().prepare('SELECT * FROM ai_jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 100').all(projectId)
    : database().prepare('SELECT * FROM ai_jobs ORDER BY created_at DESC LIMIT 100').all();
  return rows.map(parseJob);
}

export function getAiJob(id: string): AiGenerationJob | null {
  const row = database().prepare('SELECT * FROM ai_jobs WHERE id=?').get(id);
  return row ? parseJob(row) : null;
}

export function createAiJob(input: {
  projectId: string;
  projectRevision: number;
  clipIndex: number;
  provider: AiGenerationProvider;
  prompt?: string;
}): AiGenerationJob {
  const project = getProject(input.projectId);
  if (!project) throw new Error('找不到作品');
  if (project.revision !== input.projectRevision) throw new Error('作品已有更新，請重新整理後再產生');
  if (!['vertex-veo-3.1', 'minimax-h3-colab'].includes(input.provider)) throw new Error('不支援的 AI 動態化服務');
  const clip = project.project.clips[input.clipIndex];
  if (!clip?.imageUrl) throw new Error('這個場景沒有可用畫面');
  if (isVideo(clip.imageUrl)) throw new Error('這個場景已經是影片');
  if (input.provider === 'minimax-h3-colab' && !process.env.MINIMAX_H3_RUNNER_PATH?.trim()) {
    throw new Error('MiniMax H3 外部 runner 尚未完成設定');
  }
  const pending = listAiJobs(project.id).find(job =>
    job.clipIndex === input.clipIndex &&
    job.provider === input.provider &&
    job.sourceImageUrl === clip.imageUrl &&
    ['queued', 'submitting', 'running'].includes(job.status),
  );
  if (pending) return pending;
  const queue = database().prepare("SELECT COUNT(*) AS count FROM ai_jobs WHERE status IN ('queued','submitting','running')").get();
  if (Number(queue?.count) >= 10) throw new Error('AI 動態化佇列已滿，請稍後再試');

  const durationSeconds = input.provider === 'vertex-veo-3.1'
    ? chooseVeoDurationSeconds(clip.duration)
    : Math.max(4, Math.min(15, Math.ceil(clip.duration)));
  const generationInput: AiGenerationInput = {
    imageUrl: clip.imageUrl,
    durationSeconds,
    storyContext: clip.text,
    ...(input.prompt?.trim() ? { prompt: input.prompt.trim().slice(0, 800) } : {}),
  };
  const id = randomUUID();
  const now = new Date().toISOString();
  database().prepare(
    'INSERT INTO ai_jobs (id,project_id,project_revision,clip_index,provider,status,progress,source_image_url,input_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  ).run(id, project.id, project.revision, input.clipIndex, input.provider, 'queued', 0, clip.imageUrl, JSON.stringify(generationInput), now, now);
  return getAiJob(id)!;
}

export function updateAiJob(id: string, patch: Partial<Pick<AiGenerationJob, 'status' | 'progress' | 'externalId' | 'videoUrl' | 'error' | 'appliedAt'>>) {
  const map = {
    status: 'status',
    progress: 'progress',
    externalId: 'external_id',
    videoUrl: 'video_url',
    error: 'error',
    appliedAt: 'applied_at',
  } as const;
  const entries = Object.entries(patch).filter(([key]) => key in map);
  if (!entries.length) return;
  database().prepare(
    `UPDATE ai_jobs SET ${entries.map(([key]) => `${map[key as keyof typeof map]}=?`).join(',')},updated_at=? WHERE id=?`,
  ).run(...entries.map(([, value]) => value as string | number | null), new Date().toISOString(), id);
}

export function claimQueuedAiJob(id: string): boolean {
  return Boolean(database().prepare("UPDATE ai_jobs SET status='submitting',progress=2,updated_at=? WHERE id=? AND status='queued'")
    .run(new Date().toISOString(), id).changes);
}

export function activeVeoJobs(): AiGenerationJob[] {
  return database().prepare("SELECT * FROM ai_jobs WHERE provider='vertex-veo-3.1' AND status='running' ORDER BY created_at LIMIT 10")
    .all().map(parseJob);
}

export function nextQueuedAiJobs(limit = 3): AiGenerationJob[] {
  return database().prepare("SELECT * FROM ai_jobs WHERE status='queued' ORDER BY created_at LIMIT ?").all(limit).map(parseJob);
}

export function recoverAiJobsAfterRestart() {
  const now = new Date().toISOString();
  database().prepare("UPDATE ai_jobs SET status='queued',progress=0,external_id=NULL,error=NULL,updated_at=? WHERE status='submitting'").run(now);
  // H3's local runner process does not survive a service restart. Re-run the same durable job id.
  database().prepare("UPDATE ai_jobs SET status='queued',progress=0,external_id=NULL,error=NULL,updated_at=? WHERE provider='minimax-h3-colab' AND status='running'").run(now);
}

export function applyAiJob(id: string): StudioProject {
  const job = getAiJob(id);
  if (!job) throw new Error('找不到 AI 動態化工作');
  if (job.status !== 'done' || !job.videoUrl) throw new Error('AI 動態化尚未完成');
  const project = getProject(job.projectId);
  if (!project) throw new Error('找不到作品');
  if (job.appliedAt) return project;
  const clip = project.project.clips[job.clipIndex];
  if (!clip || clip.imageUrl !== job.sourceImageUrl) throw new Error('這個場景在生成期間已變更，請先確認後再重新產生');
  const clips = project.project.clips.map((item, index) => index === job.clipIndex
    ? { ...item, imageUrl: job.videoUrl!, imageEffect: 'none' as const, sceneLayout: 'cover' as const }
    : item);
  const updated = saveProject({
    id: project.id,
    revision: project.revision,
    title: project.title,
    project: { ...project.project, clips },
    voice: project.voice,
    voiceStyle: project.voiceStyle,
  });
  updateAiJob(id, { appliedAt: new Date().toISOString() });
  return updated;
}

