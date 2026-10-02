import { chmod, mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { dataRoot } from './paths';
import { driveOauthOrigin } from './oauth-origin';
import { google, type drive_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import {
  createGoogleAuthClient,
  GOOGLE_IMPERSONATE_SERVICE_ACCOUNT,
  isGoogleImpersonationConfigured,
} from '@/lib/puxin/google-auth';

export const PUXIN_DRIVE_ROOT_FOLDER_ID =
  process.env.PUXIN_DRIVE_ROOT_FOLDER_ID?.trim() || '11KCNFFXmZQG6CSITUNM_WfXA-nyOr0ah';

const tokenPath = () => path.join(dataRoot(), 'google-drive-token.json');
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

export interface DriveBrowserItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  size: number | null;
}

function oauthConfig() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

export function isDriveId(value: string): boolean {
  return DRIVE_ID_RE.test(value);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  const envToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (envToken) return envToken;
  try {
    const raw = await readFile(tokenPath(), 'utf8');
    const parsed = JSON.parse(raw) as { refresh_token?: string };
    return parsed.refresh_token?.trim() || null;
  } catch {
    return null;
  }
}

export async function saveRefreshToken(refreshToken: string): Promise<void> {
  const dir = path.dirname(tokenPath());
  await mkdir(dir, { recursive: true });
  await writeFile(tokenPath(), JSON.stringify({ refresh_token: refreshToken }, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(tokenPath(), 0o600).catch(() => undefined);
}

export function createOauthClient(origin: string) {
  const { clientId, clientSecret, configured } = oauthConfig();
  if (!configured || !clientId || !clientSecret) {
    throw new Error('Google Drive OAuth is not configured');
  }
  const redirectUri = `${driveOauthOrigin(origin)}/api/puxin/drive/callback`;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function createAuthorizedDrive(origin: string): Promise<drive_v3.Drive> {
  if (isGoogleImpersonationConfigured()) {
    const auth = await createGoogleAuthClient(DRIVE_SCOPES);
    // googleapis' generated Drive type still narrows `auth` to OAuth2Client
    // even though the runtime accepts any google-auth-library AuthClient.
    return google.drive({ version: 'v3', auth: auth as unknown as OAuth2Client });
  }
  const auth = createOauthClient(origin);
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) throw new Error('Google Drive is not connected');
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth });
}

export function buildDriveConsentUrl(origin: string, state?: string): string {
  const auth = createOauthClient(origin);
  return auth.generateAuthUrl({
    state,
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive'],
    include_granted_scopes: true,
  });
}

export async function exchangeDriveCode(origin: string, code: string): Promise<void> {
  const auth = createOauthClient(origin);
  const { tokens } = await auth.getToken(code);
  if (!tokens.refresh_token) {
    const existing = await getStoredRefreshToken();
    if (existing) return;
    throw new Error('Google did not return a refresh token');
  }
  await saveRefreshToken(tokens.refresh_token);
}

export async function driveStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  rootFolderId: string;
  mode: 'service-account' | 'oauth' | 'unconfigured';
  accessible?: boolean;
  serviceAccount?: string;
  error?: string;
}> {
  if (isGoogleImpersonationConfigured()) {
    let accessible = false;
    let error: string | undefined;
    try {
      const auth = await createGoogleAuthClient(DRIVE_SCOPES);
      const drive = google.drive({ version: 'v3', auth: auth as unknown as OAuth2Client });
      await drive.files.get({ fileId: PUXIN_DRIVE_ROOT_FOLDER_ID, fields: 'id', supportsAllDrives: true });
      accessible = true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    return {
      configured: true,
      connected: true,
      rootFolderId: PUXIN_DRIVE_ROOT_FOLDER_ID,
      mode: 'service-account',
      accessible,
      serviceAccount: GOOGLE_IMPERSONATE_SERVICE_ACCOUNT,
      ...(error ? { error } : {}),
    };
  }
  const { configured } = oauthConfig();
  return {
    configured,
    connected: configured && Boolean(await getStoredRefreshToken()),
    rootFolderId: PUXIN_DRIVE_ROOT_FOLDER_ID,
    mode: configured ? 'oauth' : 'unconfigured',
  };
}

export async function listDriveChildren(
  drive: drive_v3.Drive,
  folderId: string,
): Promise<{ folders: DriveBrowserItem[]; images: DriveBrowserItem[] }> {
  if (!isDriveId(folderId)) throw new Error('Invalid Drive folder id');
  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
  const result = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    orderBy: 'folder,name',
    pageSize: 100,
    fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size)',
    pageToken,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  files.push(...(result.data.files ?? []));
  pageToken = result.data.nextPageToken || undefined;
  } while (pageToken);
  const items: DriveBrowserItem[] = files
    .filter((item): item is drive_v3.Schema$File & { id: string; name: string; mimeType: string } =>
      Boolean(item.id && item.name && item.mimeType),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      modifiedTime: item.modifiedTime ?? null,
      size: item.size ? Number(item.size) : null,
    }));

  return {
    folders: items.filter((item) => item.mimeType === 'application/vnd.google-apps.folder'),
    images: items.filter((item) => item.mimeType.startsWith('image/')),
  };
}

export async function assertInsidePuxinRoot(drive: drive_v3.Drive, itemId: string): Promise<void> {
  if (!isDriveId(itemId)) throw new Error('Invalid Drive item id');
  let current = itemId;
  for (let depth = 0; depth < 24; depth += 1) {
    if (current === PUXIN_DRIVE_ROOT_FOLDER_ID) {
      try {
        await drive.files.get({ fileId: current, fields: 'id', supportsAllDrives: true });
      } catch {
        throw new Error('The configured Puxin Drive root folder is not shared with the service account');
      }
      return;
    }
    const response = await drive.files.get({
      fileId: current,
      fields: 'id,parents',
      supportsAllDrives: true,
    });
    const parent = response.data.parents?.[0];
    if (!parent) break;
    current = parent;
  }
  throw new Error('Drive item is outside the configured Puxin root folder');
}

export async function downloadDriveFile(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
  await assertInsidePuxinRoot(drive, fileId);
  const meta = await drive.files.get({ fileId, fields: 'id,name,mimeType,size', supportsAllDrives: true });
  const name = meta.data.name || fileId;
  const mimeType = meta.data.mimeType || 'application/octet-stream';
  if (!mimeType.startsWith('image/')) throw new Error('Only image files can be imported as Puxin scenes');
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  return { buffer: Buffer.from(response.data as ArrayBuffer), name, mimeType };
}
