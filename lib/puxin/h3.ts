import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dataRoot, existingMediaPath, mediaPath, mediaUrl } from './paths';
import { resolvePuxinImagePath } from './veo';

const execFileAsync = promisify(execFile);

export interface H3Job {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  videoUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
export interface H3GenerationInput {
  imageUrl: string;
  durationSeconds: number;
  prompt?: string;
  storyContext?: string;
}

function runnerPath() {
  const value = process.env.MINIMAX_H3_RUNNER_PATH?.trim();
  if (!value || !path.isAbsolute(value)) throw new Error('MiniMax H3 尚未設定外部 runner');
  return value;
}

async function jobDir(id: string) {
  const root = path.join(dataRoot(), 'h3-jobs', id);
  await mkdir(root, { recursive: true });
  return root;
}

async function jobFile(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('無效的 H3 job id');
  return path.join(await jobDir(id), 'job.json');
}

async function saveJob(job: H3Job) {
  job.updatedAt = new Date().toISOString();
  await writeFile(await jobFile(job.id), JSON.stringify(job, null, 2), 'utf8');
}

export async function getH3Job(id: string): Promise<H3Job> {
  return JSON.parse(await readFile(await jobFile(id), 'utf8')) as H3Job;
}

async function resolveH3Image(imageUrl: string) {
  if (imageUrl.startsWith('/api/puxin/media/image/')) {
    return existingMediaPath(imageUrl.slice('/api/puxin/media/'.length));
  }
  return resolvePuxinImagePath(imageUrl);
}

function buildPrompt(userPrompt: string | undefined, storyContext: string | undefined) {
  const motion = userPrompt?.trim() || 'warm light shifts gently, tiny environmental details move softly, and the camera makes a very slow push-in';
  const story = storyContext?.trim() ? storyContext.trim().slice(0, 400) : 'A quiet everyday meditation moment.';
  return [
    'subject_definitions:',
    '<Picture 1> is the exact reference illustration. Preserve its character identity, clothing, composition, palette, and visible Chinese typography.',
    'summary:',
    `Create one calm vertical meditation shot. Narrative mood: ${story}`,
    'retention_analysis:',
    'Keep the original illustration recognizable and stable. Do not invent new text, logos, objects, characters, cuts, dialogue, or lip-sync.',
    'detailed_description:',
    `Single continuous shot based on <Picture 1>: ${motion}. Motion must remain subtle and natural, with no camera shake and no scene cut.`,
    'overall_soundscape:',
    'Very quiet natural room ambience only; no speech.',
    'non_diegetic_music:',
    'none',
  ].join('\n');
}

function validateInput(input: H3GenerationInput) {
  runnerPath();
  if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 4 || input.durationSeconds > 15) {
    throw new Error('MiniMax H3 duration must be 4–15 seconds');
  }
}

export async function runH3Generation(
  input: H3GenerationInput,
  options?: { jobId?: string; onProgress?: (progress: number) => void | Promise<void> },
) {
  validateInput(input);
  const id = options?.jobId || randomUUID();
  const root = await jobDir(id);
  const source = await resolveH3Image(input.imageUrl);
  const promptFile = path.join(root, 'prompt.txt');
  const outputFile = path.join(root, 'output.mp4');
  await writeFile(promptFile, buildPrompt(input.prompt, input.storyContext), 'utf8');
  await options?.onProgress?.(10);
  await execFileAsync(process.env.MINIMAX_H3_PYTHON?.trim() || 'python3', [
    runnerPath(), 'single',
    '--image', source,
    '--prompt', promptFile,
    '--output', outputFile,
    '--gpu', process.env.MINIMAX_H3_GPU?.trim() || 'A100',
    '--timeout', process.env.MINIMAX_H3_TIMEOUT?.trim() || '10800',
  ], {
    timeout: Math.max(60_000, Number(process.env.MINIMAX_H3_PROCESS_TIMEOUT_MS || 14_400_000)),
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      COLAB_AUTH: process.env.MINIMAX_H3_COLAB_AUTH?.trim() || 'adc',
      H3_DURATION_SECONDS: String(input.durationSeconds),
    },
  });
  await options?.onProgress?.(92);
  const key = `video/h3-${id}.mp4`;
  const target = await mediaPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, await readFile(outputFile));
  return { videoUrl: mediaUrl(key) };
}

async function execute(job: H3Job, input: H3GenerationInput) {
  try {
    job.status = 'running'; job.progress = 5; await saveJob(job);
    const result = await runH3Generation(input, {
      jobId: job.id,
      onProgress: async progress => { job.progress = progress; await saveJob(job); },
    });
    job.status = 'done'; job.progress = 100; job.videoUrl = result.videoUrl; await saveJob(job);
  } catch (error) {
    job.status = 'failed'; job.error = error instanceof Error ? error.message.slice(0, 1200) : 'MiniMax H3 生成失敗'; await saveJob(job);
  }
}

export async function submitH3Generation(input: H3GenerationInput) {
  validateInput(input);
  const now = new Date().toISOString();
  const job: H3Job = { id: randomUUID(), status: 'queued', progress: 0, createdAt: now, updatedAt: now };
  await saveJob(job);
  void execute(job, input);
  return job;
}
