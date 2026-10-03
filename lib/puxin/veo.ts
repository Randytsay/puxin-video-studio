import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { createGoogleAuthClient, GOOGLE_CLOUD_PROJECT } from '@/lib/puxin/google-auth';
import { existingMediaPath, mediaPath, mediaUrl } from '@/lib/puxin/paths';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const VEO_LOCATION = process.env.VERTEX_VIDEO_LOCATION?.trim() || 'us-central1';
const VEO_MODEL = process.env.VERTEX_VIDEO_MODEL?.trim() || 'veo-3.1-fast-generate-001';
const PUXIN_IMAGE_ROOT = path.resolve(process.cwd(), 'public', 'uploads', 'image', 'puxin');

export const VEO_ALLOWED_DURATIONS = [4, 6, 8] as const;
export type VeoDurationSeconds = (typeof VEO_ALLOWED_DURATIONS)[number];

export interface VeoSubmitResult {
  operationName: string;
  model: string;
  durationSeconds: VeoDurationSeconds;
}

export interface VeoPollResult {
  done: boolean;
  videoUrl?: string;
  filteredCount?: number;
  error?: string;
}

function vertexModelBase(): string {
  if (!GOOGLE_CLOUD_PROJECT) throw new Error('GOOGLE_CLOUD_PROJECT is not configured');
  return `https://${VEO_LOCATION}-aiplatform.googleapis.com/v1/projects/${GOOGLE_CLOUD_PROJECT}/locations/${VEO_LOCATION}/publishers/google/models/${VEO_MODEL}`;
}

export function chooseVeoDurationSeconds(clipDuration: number): VeoDurationSeconds {
  if (!Number.isFinite(clipDuration) || clipDuration <= 4) return 4;
  if (clipDuration <= 6) return 6;
  return 8;
}

export function resolvePuxinImagePath(imageUrl: string): string {
  if (!imageUrl.startsWith('/uploads/image/puxin/')) {
    throw new Error('Veo generation only accepts imported Puxin scene images');
  }
  const relative = imageUrl.slice('/uploads/image/puxin/'.length);
  if (!relative || relative.includes('\0')) throw new Error('Invalid scene image path');
  const resolved = path.resolve(PUXIN_IMAGE_ROOT, relative);
  if (resolved !== PUXIN_IMAGE_ROOT && !resolved.startsWith(`${PUXIN_IMAGE_ROOT}${path.sep}`)) {
    throw new Error('Scene image path is outside the Puxin upload directory');
  }
  return resolved;
}

export async function resolveVeoImagePath(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('/api/puxin/media/image/')) {
    return existingMediaPath(imageUrl.slice('/api/puxin/media/'.length));
  }
  return resolvePuxinImagePath(imageUrl);
}

export function isExpectedVeoOperationName(operationName: string): boolean {
  if (!GOOGLE_CLOUD_PROJECT) return false;
  const prefix = `projects/${GOOGLE_CLOUD_PROJECT}/locations/${VEO_LOCATION}/publishers/google/models/${VEO_MODEL}/operations/`;
  return operationName.startsWith(prefix) && /^[A-Za-z0-9._\/-]+$/.test(operationName);
}

async function buildVerticalInput(imagePath: string): Promise<Buffer> {
  const source = await readFile(imagePath);
  const background = await sharp(source)
    .rotate()
    .resize(720, 1280, { fit: 'cover' })
    .blur(14)
    .modulate({ brightness: 0.82, saturation: 0.82 })
    .png()
    .toBuffer();
  const foreground = await sharp(source)
    .rotate()
    .resize(720, 1280, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(background).composite([{ input: foreground, gravity: 'center' }]).png().toBuffer();
}

function defaultMotionPrompt(storyContext?: string): string {
  const context = storyContext?.trim()
    ? ` Use this narrative only to guide the mood: ${storyContext.trim().slice(0, 280)}.`
    : '';
  return [
    'Create a calm, elegant vertical animation from this exact meditation illustration.',
    'Preserve the original composition, character design, color palette, and existing visible Chinese typography as faithfully as possible.',
    'Add only subtle natural motion: warm light gently shifts, small environmental details move softly, and the camera makes a very slow cinematic push-in.',
    'Keep the scene serene, stable, and suitable for a Buddhist meditation story.',
    'No new objects, no new text, no scene cuts, no lip movement, and no dialogue.',
    context,
  ].join(' ');
}

export async function submitPuxinVeoGeneration(input: {
  imageUrl: string;
  durationSeconds: VeoDurationSeconds;
  prompt?: string;
  storyContext?: string;
}): Promise<VeoSubmitResult> {
  if (!VEO_ALLOWED_DURATIONS.includes(input.durationSeconds)) {
    throw new Error('Veo duration must be 4, 6, or 8 seconds');
  }
  const imagePath = await resolveVeoImagePath(input.imageUrl);
  const vertical = await buildVerticalInput(imagePath);
  const auth = await createGoogleAuthClient([CLOUD_PLATFORM_SCOPE]);
  const prompt = input.prompt?.trim() || defaultMotionPrompt(input.storyContext);
  const response = await auth.request<{ name?: string }>({
    url: `${vertexModelBase()}:predictLongRunning`,
    method: 'POST',
    headers: { 'x-goog-user-project': GOOGLE_CLOUD_PROJECT },
    data: {
      instances: [{
        prompt,
        image: { bytesBase64Encoded: vertical.toString('base64'), mimeType: 'image/png' },
      }],
      parameters: {
        aspectRatio: '9:16',
        durationSeconds: input.durationSeconds,
        sampleCount: 1,
        resolution: '720p',
        resizeMode: 'pad',
        personGeneration: 'allow_adult',
      },
    },
  });
  const operationName = response.data.name;
  if (!operationName || !isExpectedVeoOperationName(operationName)) {
    throw new Error('Veo did not return a valid operation name');
  }
  return { operationName, model: VEO_MODEL, durationSeconds: input.durationSeconds };
}

function extractVideoBytes(response: Record<string, unknown>): string | null {
  const videos = Array.isArray(response.videos) ? response.videos : [];
  const generatedVideos = Array.isArray(response.generatedVideos) ? response.generatedVideos : [];
  const first = (videos[0] ?? generatedVideos[0]) as Record<string, unknown> | undefined;
  if (!first) return null;
  const nested = first.video && typeof first.video === 'object' ? (first.video as Record<string, unknown>) : null;
  const candidate = first.bytesBase64Encoded ?? first.bytesBase64 ?? nested?.bytesBase64Encoded ?? nested?.bytesBase64;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

export async function pollPuxinVeoGeneration(operationName: string): Promise<VeoPollResult> {
  if (!isExpectedVeoOperationName(operationName)) throw new Error('Invalid Veo operation name');
  const auth = await createGoogleAuthClient([CLOUD_PLATFORM_SCOPE]);
  const response = await auth.request<{
    done?: boolean;
    error?: { message?: string };
    response?: Record<string, unknown> & { raiMediaFilteredCount?: number };
  }>({
    url: `${vertexModelBase()}:fetchPredictOperation`,
    method: 'POST',
    headers: { 'x-goog-user-project': GOOGLE_CLOUD_PROJECT },
    data: { operationName },
  });
  const data = response.data;
  if (!data.done) return { done: false };
  if (data.error) return { done: true, error: data.error.message || 'Veo generation failed' };

  const modelResponse = data.response ?? {};
  const filteredCount = typeof modelResponse.raiMediaFilteredCount === 'number' ? modelResponse.raiMediaFilteredCount : 0;
  const base64 = extractVideoBytes(modelResponse);
  if (!base64) {
    return {
      done: true,
      filteredCount,
      error: filteredCount > 0 ? 'Veo safety filters removed the generated video' : 'Veo completed without returning video bytes',
    };
  }

  const operationId = operationName.split('/').pop()?.replace(/[^A-Za-z0-9._-]/g, '') || 'generated';
  const key = `video/veo-${operationId}.mp4`;
  const output = await mediaPath(key);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(base64, 'base64'));
  return { done: true, videoUrl: mediaUrl(key), filteredCount };
}
