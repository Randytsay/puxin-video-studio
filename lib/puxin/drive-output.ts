import { google } from 'googleapis';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createOauthClient, getStoredRefreshToken, PUXIN_DRIVE_ROOT_FOLDER_ID } from './drive';
import { createGoogleAuthClient } from './google-auth';
import type { OAuth2Client } from 'google-auth-library';
import { existingMediaPath } from './paths';
import { getJob, updateJob, type StudioJob } from './projects';

export const DRIVE_OUTPUT_FOLDER_ID = process.env.PUXIN_DRIVE_OUTPUT_FOLDER_ID || PUXIN_DRIVE_ROOT_FOLDER_ID;
const OUTPUT_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export async function writableDrive(origin: string) {
  const token = await getStoredRefreshToken();
  if (token && process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET) {
    const auth = createOauthClient(origin); auth.setCredentials({ refresh_token: token });
    return google.drive({ version: 'v3', auth });
  }
  // Shared Drive explicitly selected by the operator; never try to own files
  // in My Drive using a service account (it has no storage quota).
  if (process.env.PUXIN_DRIVE_OUTPUT_SHARED_DRIVE === 'true') {
    const auth = await createGoogleAuthClient([OUTPUT_SCOPE]);
    return google.drive({ version: 'v3', auth: auth as unknown as OAuth2Client });
  }
  throw new Error('成果已保存在 VPS。個人 Drive 上傳需要連接 Google 寫入授權。');
}
export async function outputStatus(origin: string) {
  try {
    const drive = await writableDrive(origin);
    const root = await drive.files.get({ fileId: DRIVE_OUTPUT_FOLDER_ID, fields: 'id,name,driveId,capabilities(canAddChildren)', supportsAllDrives: true });
    return { connected: true, writable: Boolean(root.data.capabilities?.canAddChildren), folderId: DRIVE_OUTPUT_FOLDER_ID, folderName: root.data.name };
  } catch (error) { return { connected: false, writable: false, folderId: DRIVE_OUTPUT_FOLDER_ID, error: error instanceof Error ? error.message : '尚未連接成果上傳' }; }
}
const uploads = new Map<string, Promise<string>>();
export async function uploadJobToDrive(job: StudioJob, origin: string): Promise<string> {
  if (job.driveUrl) return job.driveUrl;
  const ongoing = uploads.get(job.id); if (ongoing) return ongoing;
  const task = upload(job, origin).finally(() => uploads.delete(job.id)); uploads.set(job.id, task); return task;
}
async function upload(job: StudioJob, origin: string) {
  try {
    if (job.status !== 'done' || !job.videoUrl?.startsWith('/api/puxin/media/output/')) throw new Error('影片尚未完成');
    const drive = await writableDrive(origin);
    const root = await drive.files.get({ fileId: DRIVE_OUTPUT_FOLDER_ID, fields: 'id,driveId,capabilities(canAddChildren)', supportsAllDrives: true });
    if (!root.data.capabilities?.canAddChildren) throw new Error('成果資料夾沒有新增檔案權限');
    async function folder(parent: string, name: string, key: string) {
      const found = await drive.files.list({ q: `'${parent}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='puxinKey' and value='${key}' }`, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
      if (found.data.files?.[0]?.id) return found.data.files[0].id;
      const result = await drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parent], appProperties: { puxinKey: key } }, fields: 'id', supportsAllDrives: true });
      return result.data.id!;
    }
    const results = await folder(DRIVE_OUTPUT_FOLDER_ID, '製作成果', 'results');
    const target = await folder(results, `${job.snapshot.title} · ${job.projectId.slice(0, 8)}`, job.projectId);
    async function file(name: string, mimeType: string, body: NodeJS.ReadableStream, key: string) {
      const found = await drive.files.list({ q: `'${target}' in parents and trashed=false and appProperties has { key='puxinKey' and value='${key}' }`, fields: 'files(id,webViewLink)', supportsAllDrives: true, includeItemsFromAllDrives: true });
      if (found.data.files?.[0]?.id) return found.data.files[0];
      return (await drive.files.create({ requestBody: { name, parents: [target], appProperties: { puxinKey: key } }, media: { mimeType, body }, fields: 'id,webViewLink', supportsAllDrives: true })).data;
    }
    const output = await existingMediaPath(job.videoUrl.replace('/api/puxin/media/', ''));
    const video = await file(`${job.snapshot.title}-v${job.revision}-${job.id.slice(0, 8)}.mp4`, 'video/mp4', createReadStream(output), `${job.id}-video`);
    await file(`作品設定-v${job.revision}-${job.id.slice(0, 8)}.json`, 'application/json', Readable.from([JSON.stringify(job.snapshot, null, 2)]), `${job.id}-project`);
    await file(`旁白腳本-v${job.revision}-${job.id.slice(0, 8)}.txt`, 'text/plain', Readable.from([job.snapshot.project.clips.map((c, i) => `${i + 1}. ${c.plotName}\n${c.text}`).join('\n\n')]), `${job.id}-script`);
    for (let i = 0; i < job.snapshot.project.clips.length; i++) {
      const url = job.snapshot.project.clips[i].audioUrl;
      if (url?.startsWith('/api/puxin/media/audio/') && url.endsWith('.wav')) await file(`旁白-${String(i + 1).padStart(2, '0')}-v${job.revision}.wav`, 'audio/wav', Readable.from([await readFile(await existingMediaPath(url.replace('/api/puxin/media/', '')))]), `${job.id}-audio-${i}`);
    }
    if (!video.webViewLink) throw new Error('Drive 沒有回傳成果連結，請重試');
    updateJob(job.id, { driveUrl: video.webViewLink, syncError: null });
    return getJob(job.id)!.driveUrl!;
  } catch (error) { updateJob(job.id, { syncError: error instanceof Error ? error.message : '上傳失敗' }); throw error; }
}
