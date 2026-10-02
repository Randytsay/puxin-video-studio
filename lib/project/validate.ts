// Programmatic validation of the Abekyo project format — the JSON accepted by
// POST /api/render. This is the single source of truth for what a "project"
// is at runtime: /api/render and /api/project/validate both call it, and
// public/schema/project.schema.json is the machine-readable mirror published
// for external generators (scripts, CI, LLM pipelines).
//
// Hand-rolled rather than ajv/zod on purpose: the format is small and stable,
// and the repo promises zero runtime dependencies beyond the framework.
// tests/project-validate.test.ts pins the rules; keep the published schema in
// sync when they change.
//
// Two kinds of feedback:
//   errors   — the project cannot render (wrong type, out of bounds); the
//              caller gets a 400/422 and nothing is spawned.
//   warnings — the project renders but probably not the way the author meant
//              (black-frame clip, subtitle past the end of the video, …).
//
// Media-URL *policy* (same-origin / allowlisted hosts) lives in
// lib/project/media.ts and is applied by both endpoints on top of this
// structural pass; only URL types are checked here.

import type {
  VideoClip,
  Subtitle,
  VideoResolution,
  VideoAspectRatio,
} from '@/src/types';
import {
  computeTotalFrames,
  VIDEO_FPS,
  DEFAULT_CLIP_DURATION_SECONDS,
} from '@/src/timeline';

export interface ProjectInput {
  clips: VideoClip[];
  subtitles: Subtitle[];
  bgmUrl: string | null;
  bgmVolume: number;
  bgmStartTime: number;
  bgmEndTime: number | null;
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
  productName?: string;
  audioEnabled: boolean;
  brand?: { enabled: boolean; closingText: string };
}

export interface ValidationIssue {
  /** JSON-path-ish location, e.g. "clips[2].duration". Empty for body-level issues. */
  path: string;
  message: string;
}

export interface ProjectSummary {
  clipCount: number;
  subtitleCount: number;
  /** Sum of clip durations in seconds (missing durations counted at the 3s default). */
  durationSeconds: number;
  /** Composition length on the fixed 30fps frame grid. */
  durationInFrames: number;
  fps: number;
  hasBgm: boolean;
}

export type ValidationResult =
  | { ok: true; project: ProjectInput; warnings: ValidationIssue[]; summary: ProjectSummary }
  | { ok: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };

// --- Resource ceilings -------------------------------------------------------
// renderMedia() encodes for as long as the composition says it should, so an
// unbounded `duration` is a remote "fill the disk / pin the CPU" primitive on
// an endpoint that has no authentication. Every quantity that feeds
// computeTotalFrames() gets a ceiling here. Read at call time (not module
// load) so a deployment can tune them without ordering concerns in tests.
interface ProjectLimits {
  maxClips: number;
  maxClipDurationSeconds: number;
  maxTotalDurationSeconds: number;
  maxSubtitles: number;
  maxTextLength: number;
}

function limitsFromEnv(): ProjectLimits {
  return {
    maxClips: Math.max(1, Number(process.env.RENDER_MAX_CLIPS ?? 200)),
    maxClipDurationSeconds: Math.max(
      1,
      Number(process.env.RENDER_MAX_CLIP_DURATION_SECONDS ?? 300),
    ),
    maxTotalDurationSeconds: Math.max(
      1,
      Number(process.env.RENDER_MAX_TOTAL_DURATION_SECONDS ?? 1800),
    ),
    maxSubtitles: Math.max(1, Number(process.env.RENDER_MAX_SUBTITLES ?? 2000)),
    maxTextLength: 5000,
  };
}

const RESOLUTIONS: readonly string[] = ['720p', '1080p'];
const ASPECT_RATIOS: readonly string[] = ['16:9', '9:16', '1:1', '3:4'];
const IMAGE_EFFECTS: readonly string[] = ['none', 'kenBurns', 'zoom', 'pan', 'zoomOut', 'pulse'];
const SCENE_LAYOUTS: readonly string[] = ['cover', 'fit-blur', 'contain'];
const TRANSITIONS: readonly string[] = [
  'none', 'fade', 'slideLeft', 'slideRight', 'slideUp', 'slideDown',
  'wipeLeft', 'wipeRight', 'zoomIn', 'zoomOut', 'crossfade', 'slide',
  'zoom', 'wipe', 'blur',
];
const SUBTITLE_POSITIONS: readonly string[] = ['top', 'center', 'bottom'];
const SUBTITLE_ALIGNS: readonly string[] = ['left', 'center', 'right'];

/**
 * Enum values accepted by the validator, exported so tests can pin them
 * against the published JSON Schema and fail when the two drift apart.
 */
export const PROJECT_ENUMS = {
  resolutions: RESOLUTIONS,
  aspectRatios: ASPECT_RATIOS,
  imageEffects: IMAGE_EFFECTS,
  sceneLayouts: SCENE_LAYOUTS,
  transitions: TRANSITIONS,
  subtitlePositions: SUBTITLE_POSITIONS,
  subtitleAligns: SUBTITLE_ALIGNS,
} as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validate an untrusted value as an Abekyo project. Returns either a
 * normalized `ProjectInput` (defaults applied) plus a render summary, or a
 * list of path-scoped errors. Never throws.
 */
export function validateProject(input: unknown): ValidationResult {
  const limits = limitsFromEnv();
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{ path: '', message: 'Project must be a JSON object' }],
      warnings,
    };
  }

  // --- clips -----------------------------------------------------------------
  const rawClips = input.clips;
  let totalDuration = 0;
  if (!Array.isArray(rawClips) || rawClips.length === 0) {
    err('clips', 'clips is required and must be a non-empty array');
  } else if (rawClips.length > limits.maxClips) {
    err('clips', `Too many clips (max ${limits.maxClips})`);
  } else {
    rawClips.forEach((clip, i) => {
      const at = (field: string) => `clips[${i}].${field}`;
      if (!isRecord(clip)) {
        err(`clips[${i}]`, 'each clip must be an object');
        return;
      }
      if (clip.plotName !== undefined && typeof clip.plotName !== 'string') {
        err(at('plotName'), 'plotName must be a string');
      }
      if (clip.text !== undefined && typeof clip.text !== 'string') {
        err(at('text'), 'text must be a string');
      } else if (typeof clip.text === 'string' && clip.text.length > limits.maxTextLength) {
        err(at('text'), `text is too long (max ${limits.maxTextLength} characters)`);
      }
      if (clip.imageUrl !== null && clip.imageUrl !== undefined && typeof clip.imageUrl !== 'string') {
        err(at('imageUrl'), 'imageUrl must be a string or null');
      }
      if (clip.audioUrl !== undefined && typeof clip.audioUrl !== 'string') {
        err(at('audioUrl'), 'audioUrl must be a string (empty string for no narration)');
      }
      // `duration` is optional in the wire format — the timeline falls back to
      // 3s — but when present it must be sane and under the per-clip ceiling.
      if (clip.duration !== undefined && clip.duration !== null) {
        if (!isFiniteNumber(clip.duration) || clip.duration <= 0) {
          err(at('duration'), 'duration must be a positive number (seconds)');
        } else if (clip.duration > limits.maxClipDurationSeconds) {
          err(at('duration'), `duration exceeds the ${limits.maxClipDurationSeconds}s limit`);
        }
      } else {
        warn(at('duration'), `duration missing; the clip defaults to ${DEFAULT_CLIP_DURATION_SECONDS}s`);
      }
      totalDuration += isFiniteNumber(clip.duration) && clip.duration > 0
        ? clip.duration
        : DEFAULT_CLIP_DURATION_SECONDS;
      if (clip.index !== undefined && !Number.isInteger(clip.index)) {
        err(at('index'), 'index must be an integer');
      } else if (Number.isInteger(clip.index) && clip.index !== i) {
        warn(at('index'), `index is ${clip.index} but the clip sits at position ${i}; playback order follows array position`);
      }
      if (clip.imageEffect !== undefined && !IMAGE_EFFECTS.includes(clip.imageEffect as string)) {
        err(at('imageEffect'), `imageEffect must be one of: ${IMAGE_EFFECTS.join(', ')}`);
      }
      if (clip.sceneLayout !== undefined && !SCENE_LAYOUTS.includes(clip.sceneLayout as string)) {
        err(at('sceneLayout'), `sceneLayout must be one of: ${SCENE_LAYOUTS.join(', ')}`);
      }
      if (clip.showSceneSubtitle !== undefined && typeof clip.showSceneSubtitle !== 'boolean') {
        err(at('showSceneSubtitle'), 'showSceneSubtitle must be a boolean');
      }
      if (clip.transitionType !== undefined && !TRANSITIONS.includes(clip.transitionType as string)) {
        err(at('transitionType'), `transitionType must be one of: ${TRANSITIONS.join(', ')}`);
      }
      if (clip.transitionDuration !== undefined && (!isFiniteNumber(clip.transitionDuration) || clip.transitionDuration <= 0)) {
        err(at('transitionDuration'), 'transitionDuration must be a positive number (seconds)');
      }
      if (clip.audioStartTime !== undefined && (!isFiniteNumber(clip.audioStartTime) || clip.audioStartTime < 0)) {
        err(at('audioStartTime'), 'audioStartTime must be a number >= 0 (seconds)');
      }
      if (clip.scale !== undefined && (!isFiniteNumber(clip.scale) || clip.scale <= 0)) {
        err(at('scale'), 'scale must be a positive number');
      }
      if (clip.position !== undefined) {
        if (!isRecord(clip.position) || !isFiniteNumber(clip.position.x) || !isFiniteNumber(clip.position.y)) {
          err(at('position'), 'position must be an object with numeric x and y');
        }
      }
      if (!clip.imageUrl && !(clip as Record<string, unknown>).image_url) {
        warn(at('imageUrl'), 'clip has no image or video; it will render as a black frame');
      }
    });
    if (totalDuration > limits.maxTotalDurationSeconds) {
      err('clips', `Total duration ${Math.round(totalDuration)}s exceeds the ${limits.maxTotalDurationSeconds}s limit`);
    }
  }

  // --- subtitles -------------------------------------------------------------
  const rawSubtitles = input.subtitles ?? [];
  if (!Array.isArray(rawSubtitles)) {
    err('subtitles', 'subtitles must be an array when present');
  } else if (rawSubtitles.length > limits.maxSubtitles) {
    err('subtitles', `Too many subtitles (max ${limits.maxSubtitles})`);
  } else {
    const seenIds = new Set<string>();
    rawSubtitles.forEach((sub, i) => {
      const at = (field: string) => `subtitles[${i}].${field}`;
      if (!isRecord(sub)) {
        err(`subtitles[${i}]`, 'each subtitle must be an object');
        return;
      }
      if (sub.id !== undefined && typeof sub.id !== 'string') {
        err(at('id'), 'id must be a string');
      } else if (typeof sub.id === 'string') {
        if (seenIds.has(sub.id)) {
          warn(at('id'), `duplicate subtitle id "${sub.id}"; editors that key on id will conflate them`);
        }
        seenIds.add(sub.id);
      }
      if (typeof sub.text !== 'string') {
        err(at('text'), 'text is required and must be a string');
      } else if (sub.text.length > limits.maxTextLength) {
        err(at('text'), `text is too long (max ${limits.maxTextLength} characters)`);
      }
      const start = sub.startTime;
      const end = sub.endTime;
      if (!isFiniteNumber(start) || start < 0) err(at('startTime'), 'startTime must be a number >= 0 (seconds)');
      if (!isFiniteNumber(end)) err(at('endTime'), 'endTime must be a number (seconds)');
      if (isFiniteNumber(start) && isFiniteNumber(end)) {
        if (end < start) {
          err(at('endTime'), 'endTime must not be before startTime');
        } else if (end === start) {
          warn(at('endTime'), 'endTime equals startTime; the subtitle will never be visible');
        }
      }
      if (sub.position !== undefined && !SUBTITLE_POSITIONS.includes(sub.position as string)) {
        err(at('position'), `position must be one of: ${SUBTITLE_POSITIONS.join(', ')}`);
      }
      if (sub.align !== undefined && !SUBTITLE_ALIGNS.includes(sub.align as string)) {
        err(at('align'), `align must be one of: ${SUBTITLE_ALIGNS.join(', ')}`);
      }
      const fontSize = sub.fontSizePercent ?? sub.fontSize;
      if (fontSize !== undefined && (!isFiniteNumber(fontSize) || fontSize <= 0)) {
        err(at('fontSize'), 'fontSize / fontSizePercent must be a positive number (percent of frame height)');
      }
      if (sub.fontWeight !== undefined && (!isFiniteNumber(sub.fontWeight) || sub.fontWeight < 100 || sub.fontWeight > 900)) {
        err(at('fontWeight'), 'fontWeight must be a number between 100 and 900');
      }
    });
  }

  // --- scalars ---------------------------------------------------------------
  const resolution = input.resolution;
  if (typeof resolution !== 'string' || !RESOLUTIONS.includes(resolution)) {
    err('resolution', `resolution is required and must be one of: ${RESOLUTIONS.join(', ')}`);
  }
  const aspectRatio = input.aspectRatio;
  if (typeof aspectRatio !== 'string' || !ASPECT_RATIOS.includes(aspectRatio)) {
    err('aspectRatio', `aspectRatio is required and must be one of: ${ASPECT_RATIOS.join(', ')}`);
  }
  if (input.bgmUrl !== undefined && input.bgmUrl !== null && typeof input.bgmUrl !== 'string') {
    err('bgmUrl', 'bgmUrl must be a string or null');
  }
  if (input.bgmVolume !== undefined && (!isFiniteNumber(input.bgmVolume) || input.bgmVolume < 0 || input.bgmVolume > 1)) {
    err('bgmVolume', 'bgmVolume must be between 0 and 1');
  }
  if (input.bgmStartTime !== undefined && (!isFiniteNumber(input.bgmStartTime) || input.bgmStartTime < 0)) {
    err('bgmStartTime', 'bgmStartTime must be a non-negative number');
  }
  if (
    input.bgmEndTime !== undefined &&
    input.bgmEndTime !== null &&
    (!isFiniteNumber(input.bgmEndTime) || input.bgmEndTime < 0)
  ) {
    err('bgmEndTime', 'bgmEndTime must be a non-negative number or null');
  }
  if (input.productName !== undefined && typeof input.productName !== 'string') {
    err('productName', 'productName must be a string');
  }
  if (input.audioEnabled !== undefined && typeof input.audioEnabled !== 'boolean') {
    err('audioEnabled', 'audioEnabled must be a boolean');
  }

  if (input.brand !== undefined && (!isRecord(input.brand) || typeof input.brand.enabled !== 'boolean' || typeof input.brand.closingText !== 'string' || input.brand.closingText.length > 300)) err('brand', '品牌設定不正確');

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }

  const clips = rawClips as VideoClip[];
  const subtitles = rawSubtitles as Subtitle[];
  const project: ProjectInput = {
    clips,
    subtitles,
    bgmUrl: (input.bgmUrl as string | null | undefined) ?? null,
    bgmVolume: (input.bgmVolume as number | undefined) ?? 0.3,
    bgmStartTime: (input.bgmStartTime as number | undefined) ?? 0,
    bgmEndTime: (input.bgmEndTime as number | null | undefined) ?? null,
    resolution: resolution as VideoResolution,
    aspectRatio: aspectRatio as VideoAspectRatio,
    productName: input.productName as string | undefined,
    audioEnabled: (input.audioEnabled as boolean | undefined) ?? true,
    ...(input.brand ? { brand: input.brand as { enabled: boolean; closingText: string } } : {}),
  };

  const summary: ProjectSummary = {
    clipCount: clips.length,
    subtitleCount: subtitles.length,
    durationSeconds: Math.round(totalDuration * 1000) / 1000,
    durationInFrames: computeTotalFrames(clips),
    fps: VIDEO_FPS,
    hasBgm: Boolean(project.bgmUrl),
  };

  subtitles.forEach((sub, i) => {
    if (sub.startTime >= summary.durationSeconds) {
      warn(
        `subtitles[${i}].startTime`,
        `subtitle starts at ${sub.startTime}s but the video ends at ${summary.durationSeconds}s; it will never be shown`,
      );
    }
  });

  return { ok: true, project, warnings, summary };
}
