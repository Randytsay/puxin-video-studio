import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ProjectInput } from '@/lib/project/validate';
import { validateProject } from '@/lib/project/validate';
import { dataRoot } from './paths';

type Row = Record<string, string | number | null>;
interface Database { exec(sql: string): void; prepare(sql: string): { run(...values: (string | number | null)[]): { changes: number }; get(...values: (string | number | null)[]): Row | undefined; all(...values: (string | number | null)[]): Row[] }; }
export interface StudioProject {
  id: string; title: string; revision: number; createdAt: string; updatedAt: string;
  project: ProjectInput; voice: string; voiceStyle: string; driveFolderId?: string; archivedAt?: string;
}
export interface StudioJob {
  id: string; projectId: string; revision: number; status: 'queued' | 'rendering' | 'done' | 'failed';
  progress: number; error: string | null; videoUrl: string | null; driveUrl: string | null;
  syncError: string | null; createdAt: string; updatedAt: string; snapshot: StudioProject;
}
let connection: Database | undefined;
let connectionRoot = '';
export function database(): Database {
  const root = dataRoot();
  if (connection && root === connectionRoot) return connection;
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const { DatabaseSync } = createRequire(path.join(process.cwd(), 'package.json'))('node:sqlite') as { DatabaseSync: new (file: string) => Database };
  connection = new DatabaseSync(path.join(root, 'studio.sqlite'));
  connectionRoot = root;
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0, error TEXT, video_url TEXT, drive_url TEXT, sync_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, snapshot TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_revision INTEGER NOT NULL,
      clip_index INTEGER NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      source_image_url TEXT NOT NULL,
      input_json TEXT NOT NULL,
      external_id TEXT,
      video_url TEXT,
      error TEXT,
      applied_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ai_jobs_project_idx ON ai_jobs(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS ai_jobs_status_idx ON ai_jobs(status, created_at);
    CREATE TABLE IF NOT EXISTS tts_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_revision INTEGER NOT NULL,
      status TEXT NOT NULL,
      progress REAL NOT NULL DEFAULT 0,
      cursor INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      input_json TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tts_jobs_project_idx ON tts_jobs(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS tts_jobs_status_idx ON tts_jobs(status, created_at);`);
  return connection;
}
function parseProject(row: Row): StudioProject { return JSON.parse(String(row.document)); }
function parseJob(row: Row): StudioJob {
  return { id: String(row.id), projectId: String(row.project_id), revision: Number(row.revision), status: row.status as StudioJob['status'], progress: Number(row.progress), error: row.error as string | null, videoUrl: row.video_url as string | null, driveUrl: row.drive_url as string | null, syncError: row.sync_error as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at), snapshot: JSON.parse(String(row.snapshot)) };
}
export function listProjects(options?: { archived?: boolean }): StudioProject[] {
  const archived = options?.archived === true;
  return database().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all().map(parseProject).filter(project => archived ? Boolean(project.archivedAt) : !project.archivedAt);
}
export function getProject(id: string): StudioProject | null { const row = database().prepare('SELECT * FROM projects WHERE id=?').get(id); return row ? parseProject(row) : null; }
export function setProjectArchived(id: string, archived: boolean): StudioProject {
  const existing = getProject(id);
  if (!existing) throw new Error('找不到作品');
  const now = new Date().toISOString();
  const record: StudioProject = {
    ...existing,
    revision: existing.revision + 1,
    updatedAt: now,
    archivedAt: archived ? now : undefined,
  };
  const update = database().prepare('UPDATE projects SET revision=?,updated_at=?,document=? WHERE id=? AND revision=?')
    .run(record.revision, now, JSON.stringify(record), id, existing.revision);
  if (!update.changes) throw new Error('作品已在另一個視窗更新，請重新整理');
  return record;
}
export function saveProject(input: { id?: string; revision?: number; title: string; project: unknown; voice?: string; voiceStyle?: string }): StudioProject {
  const title = input.title?.trim().slice(0, 120);
  if (!title) throw new Error('請輸入作品名稱');
  const result = validateProject(input.project);
  if (!result.ok) throw new Error(result.errors.map(e => `${e.path}: ${e.message}`).join('; '));
  for (const clip of result.project.clips) {
    for (const url of [clip.imageUrl, clip.audioUrl]) if (url && !url.startsWith('/api/puxin/media/') && !url.startsWith('/uploads/') && !url.startsWith('/brand/')) throw new Error('作品只能使用已匯入的素材');
  }
  if (result.project.bgmUrl && !result.project.bgmUrl.startsWith('/api/puxin/media/') && !result.project.bgmUrl.startsWith('/uploads/')) throw new Error('請先匯入配樂音檔');
  const now = new Date().toISOString();
  const existing = input.id ? getProject(input.id) : null;
  if (input.id && !existing) throw new Error('找不到作品');
  if (existing && input.revision !== existing.revision) throw new Error('作品已在另一個視窗更新，請重新開啟');
  const record: StudioProject = { id: existing?.id || randomUUID(), title, revision: (existing?.revision || 0) + 1, createdAt: existing?.createdAt || now, updatedAt: now, project: result.project, voice: input.voice?.slice(0, 40) || existing?.voice || 'Kore', voiceStyle: input.voiceStyle?.slice(0, 800) ?? existing?.voiceStyle ?? '請用自然的台灣華語，溫和、清楚，不刻意煽情；句子之間自然停頓。', driveFolderId: existing?.driveFolderId, archivedAt: existing?.archivedAt };
  if (existing) {
    const update = database().prepare('UPDATE projects SET title=?,revision=?,updated_at=?,document=? WHERE id=? AND revision=?').run(title, record.revision, now, JSON.stringify(record), record.id, existing.revision);
    if (!update.changes) throw new Error('作品已在另一個視窗更新，請重新開啟');
  } else database().prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').run(record.id, title, record.revision, now, now, JSON.stringify(record));
  return record;
}
export function listJobs(projectId?: string): StudioJob[] {
  return (projectId ? database().prepare('SELECT * FROM jobs WHERE project_id=? ORDER BY created_at DESC').all(projectId) : database().prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50').all()).map(parseJob);
}
export function getJob(id: string): StudioJob | null { const row = database().prepare('SELECT * FROM jobs WHERE id=?').get(id); return row ? parseJob(row) : null; }
export function createJob(project: StudioProject): StudioJob {
  const pending = listJobs(project.id).find(j => j.revision === project.revision && ['queued', 'rendering'].includes(j.status));
  if (pending) return pending;
  const queue = database().prepare("SELECT COUNT(*) AS count FROM jobs WHERE status IN ('queued','rendering')").get();
  if (Number(queue?.count) >= 10) throw new Error('匯出佇列已滿，請稍後再試');
  const now = new Date().toISOString();
  const id = randomUUID();
  database().prepare('INSERT INTO jobs (id,project_id,revision,status,created_at,updated_at,snapshot) VALUES (?,?,?, ?,?,?,?)').run(id, project.id, project.revision, 'queued', now, now, JSON.stringify(project));
  return getJob(id)!;
}
export function updateJob(id: string, patch: Partial<Pick<StudioJob, 'status' | 'progress' | 'error' | 'videoUrl' | 'driveUrl' | 'syncError'>>) {
  const map = { status: 'status', progress: 'progress', error: 'error', videoUrl: 'video_url', driveUrl: 'drive_url', syncError: 'sync_error' };
  const entries = Object.entries(patch).filter(([key]) => key in map);
  if (!entries.length) return;
  database().prepare(`UPDATE jobs SET ${entries.map(([key]) => `${map[key as keyof typeof map]}=?`).join(',')},updated_at=? WHERE id=?`).run(...entries.map(([, value]) => value as string | number | null), new Date().toISOString(), id);
}
