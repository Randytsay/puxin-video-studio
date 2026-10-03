import { randomUUID } from 'node:crypto';
import { database, getProject } from './projects';

export type TtsBatchStatus = 'queued' | 'running' | 'done' | 'failed';

export interface TtsBatchTarget {
  index: number;
  text: string;
}

export interface TtsBatchInput {
  voice: string;
  style: string;
  targets: TtsBatchTarget[];
}

export interface TtsBatchJob {
  id: string;
  projectId: string;
  projectRevision: number;
  status: TtsBatchStatus;
  progress: number;
  cursor: number;
  total: number;
  input: TtsBatchInput;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

type Row = Record<string, string | number | null>;

function parseJob(row: Row): TtsBatchJob {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    projectRevision: Number(row.project_revision),
    status: row.status as TtsBatchStatus,
    progress: Number(row.progress),
    cursor: Number(row.cursor),
    total: Number(row.total),
    input: JSON.parse(String(row.input_json)) as TtsBatchInput,
    error: row.error as string | null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listTtsJobs(projectId?: string): TtsBatchJob[] {
  const rows = projectId
    ? database().prepare('SELECT * FROM tts_jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 30').all(projectId)
    : database().prepare('SELECT * FROM tts_jobs ORDER BY created_at DESC LIMIT 50').all();
  return rows.map(parseJob);
}

export function getTtsJob(id: string): TtsBatchJob | null {
  const row = database().prepare('SELECT * FROM tts_jobs WHERE id=?').get(id);
  return row ? parseJob(row) : null;
}

export function createTtsJob(input: { projectId: string; projectRevision: number }): TtsBatchJob {
  const project = getProject(input.projectId);
  if (!project) throw new Error('找不到作品');
  if (project.revision !== input.projectRevision) throw new Error('作品已有更新，請重新整理後再產生');

  const active = listTtsJobs(project.id).find(job => ['queued', 'running'].includes(job.status));
  if (active) return active;

  const targets = project.project.clips
    .map((clip, index) => ({ index, text: clip.text.trim(), hasAudio: Boolean(clip.audioUrl) }))
    .filter(target => target.text && !target.hasAudio)
    .map(({ index, text }) => ({ index, text }));
  if (!targets.length) throw new Error('所有有旁白文字的場景都已經有音訊');

  const queue = database().prepare("SELECT COUNT(*) AS count FROM tts_jobs WHERE status IN ('queued','running')").get();
  if (Number(queue?.count) >= 5) throw new Error('旁白背景佇列已滿，請稍後再試');

  const id = randomUUID();
  const now = new Date().toISOString();
  const batchInput: TtsBatchInput = {
    voice: project.voice,
    style: project.voiceStyle,
    targets,
  };
  database().prepare(
    'INSERT INTO tts_jobs (id,project_id,project_revision,status,progress,cursor,total,input_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(id, project.id, project.revision, 'queued', 0, 0, targets.length, JSON.stringify(batchInput), now, now);
  return getTtsJob(id)!;
}

export function updateTtsJob(
  id: string,
  patch: Partial<Pick<TtsBatchJob, 'status' | 'progress' | 'cursor' | 'error'>>,
) {
  const map = { status: 'status', progress: 'progress', cursor: 'cursor', error: 'error' } as const;
  const entries = Object.entries(patch).filter(([key]) => key in map);
  if (!entries.length) return;
  const assignments = entries.map(([key]) => map[key as keyof typeof map] + '=?').join(',');
  database().prepare(
    'UPDATE tts_jobs SET ' + assignments + ',updated_at=? WHERE id=?',
  ).run(...entries.map(([, value]) => value as string | number | null), new Date().toISOString(), id);
}

export function claimQueuedTtsJob(id: string): boolean {
  return Boolean(database().prepare(
    "UPDATE tts_jobs SET status='running',error=NULL,updated_at=? WHERE id=? AND status='queued'",
  ).run(new Date().toISOString(), id).changes);
}

export function nextQueuedTtsJobs(limit = 1): TtsBatchJob[] {
  return database().prepare("SELECT * FROM tts_jobs WHERE status='queued' ORDER BY created_at LIMIT ?").all(limit).map(parseJob);
}

export function recoverTtsJobsAfterRestart() {
  database().prepare("UPDATE tts_jobs SET status='queued',updated_at=? WHERE status='running'").run(new Date().toISOString());
}
