import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { validateProject, PROJECT_ENUMS } from '@/lib/project/validate';

// Convenience: a minimal, unambiguously valid project.
function validProject() {
  return {
    clips: [
      {
        plotName: 'Intro',
        text: 'Opening scene',
        imageUrl: '/uploads/image/intro.png',
        audioUrl: '',
        duration: 3,
        index: 0,
      },
      {
        plotName: 'Detail',
        text: 'Close-up',
        imageUrl: '/uploads/image/detail.png',
        audioUrl: '/uploads/audio/detail.mp3',
        duration: 5,
        index: 1,
        transitionType: 'crossfade',
      },
    ],
    subtitles: [
      {
        id: 's1',
        text: 'Hello',
        startTime: 0.5,
        endTime: 2.5,
        position: 'bottom',
        fontSize: 5,
        color: '#ffffff',
        align: 'center',
      },
    ],
    resolution: '1080p',
    aspectRatio: '16:9',
  };
}

function errorPaths(result: ReturnType<typeof validateProject>): string[] {
  return result.ok ? [] : result.errors.map((e) => e.path);
}

afterEach(() => {
  delete process.env.RENDER_MAX_CLIPS;
  delete process.env.RENDER_MAX_TOTAL_DURATION_SECONDS;
});

describe('validateProject — accepts', () => {
  it('accepts a valid project and computes the summary', () => {
    const result = validateProject(validProject());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toMatchObject({
      clipCount: 2,
      subtitleCount: 1,
      durationSeconds: 8,
      durationInFrames: 240, // 8s at 30fps
      fps: 30,
      hasBgm: false,
    });
    expect(result.warnings).toEqual([]);
  });

  it('applies defaults for omitted optional fields', () => {
    const result = validateProject(validProject());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.bgmUrl).toBeNull();
    expect(result.project.bgmVolume).toBe(0.3);
    expect(result.project.bgmStartTime).toBe(0);
    expect(result.project.bgmEndTime).toBeNull();
    expect(result.project.audioEnabled).toBe(true);
  });

  it('tolerates a missing duration with a warning (3s default)', () => {
    const p = validProject();
    delete (p.clips[0] as Record<string, unknown>).duration;
    const result = validateProject(p);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.durationSeconds).toBe(8); // 3 (default) + 5
    expect(result.warnings.some((w) => w.path === 'clips[0].duration')).toBe(true);
  });
});

describe('validateProject — rejects', () => {
  it('rejects non-object input', () => {
    for (const input of [null, 'x', 42, [1]]) {
      const result = validateProject(input);
      expect(result.ok).toBe(false);
    }
  });

  it('rejects missing or empty clips', () => {
    expect(errorPaths(validateProject({ resolution: '1080p', aspectRatio: '16:9' }))).toContain('clips');
    expect(errorPaths(validateProject({ ...validProject(), clips: [] }))).toContain('clips');
  });

  it('rejects a bad resolution and aspectRatio', () => {
    expect(errorPaths(validateProject({ ...validProject(), resolution: '4k' }))).toContain('resolution');
    expect(errorPaths(validateProject({ ...validProject(), aspectRatio: '21:9' }))).toContain('aspectRatio');
  });

  it('rejects non-positive and non-numeric durations', () => {
    const zero = validProject();
    zero.clips[0].duration = 0;
    expect(errorPaths(validateProject(zero))).toContain('clips[0].duration');

    const nan = validProject();
    (nan.clips[0] as Record<string, unknown>).duration = 'long';
    expect(errorPaths(validateProject(nan))).toContain('clips[0].duration');
  });

  it('rejects unknown enum values', () => {
    const badTransition = validProject();
    (badTransition.clips[1] as Record<string, unknown>).transitionType = 'spin';
    expect(errorPaths(validateProject(badTransition))).toContain('clips[1].transitionType');

    const badEffect = validProject();
    (badEffect.clips[0] as Record<string, unknown>).imageEffect = 'wobble';
    expect(errorPaths(validateProject(badEffect))).toContain('clips[0].imageEffect');
  });

  it('rejects a subtitle whose endTime is before startTime, or with no text', () => {
    const p = validProject();
    p.subtitles[0].startTime = 3;
    p.subtitles[0].endTime = 1;
    expect(errorPaths(validateProject(p))).toContain('subtitles[0].endTime');

    const noText = validProject();
    delete (noText.subtitles[0] as Record<string, unknown>).text;
    expect(errorPaths(validateProject(noText))).toContain('subtitles[0].text');
  });

  it('rejects bgm fields out of range', () => {
    expect(errorPaths(validateProject({ ...validProject(), bgmVolume: 1.5 }))).toContain('bgmVolume');
    expect(errorPaths(validateProject({ ...validProject(), bgmStartTime: -1 }))).toContain('bgmStartTime');
    expect(errorPaths(validateProject({ ...validProject(), bgmEndTime: -2 }))).toContain('bgmEndTime');
  });

  it('enforces the clip-count ceiling from the environment', () => {
    process.env.RENDER_MAX_CLIPS = '1';
    const result = validateProject(validProject());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/max 1/);
  });

  it('enforces the total-duration ceiling from the environment', () => {
    process.env.RENDER_MAX_TOTAL_DURATION_SECONDS = '6';
    const result = validateProject(validProject()); // 8s total
    expect(result.ok).toBe(false);
  });
});

describe('validateProject — warnings', () => {
  it('warns on index/position mismatch without rejecting', () => {
    const p = validProject();
    p.clips[1].index = 5;
    const result = validateProject(p);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'clips[1].index')).toBe(true);
  });

  it('warns when a clip has no visual media', () => {
    const p = validProject();
    p.clips[0].imageUrl = null as unknown as string;
    const result = validateProject(p);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'clips[0].imageUrl')).toBe(true);
  });

  it('warns when a subtitle starts after the video ends', () => {
    const p = validProject();
    p.subtitles[0].startTime = 100;
    p.subtitles[0].endTime = 102;
    const result = validateProject(p);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'subtitles[0].startTime')).toBe(true);
  });

  it('warns on duplicate subtitle ids without rejecting', () => {
    const p = validProject();
    p.subtitles.push({ ...p.subtitles[0], startTime: 3, endTime: 4 });
    const result = validateProject(p);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.some((w) => w.path === 'subtitles[1].id')).toBe(true);
  });
});

describe('published schema stays in sync with the validator', () => {
  const schema = JSON.parse(
    readFileSync(path.join(process.cwd(), 'public', 'schema', 'project.schema.json'), 'utf8'),
  );

  it('agrees on every enum', () => {
    expect(schema.properties.resolution.enum).toEqual([...PROJECT_ENUMS.resolutions]);
    expect(schema.properties.aspectRatio.enum).toEqual([...PROJECT_ENUMS.aspectRatios]);
    expect(schema.$defs.clip.properties.imageEffect.enum).toEqual([...PROJECT_ENUMS.imageEffects]);
    expect(schema.$defs.clip.properties.sceneLayout.enum).toEqual([...PROJECT_ENUMS.sceneLayouts]);
    expect(schema.$defs.clip.properties.transitionType.enum).toEqual([...PROJECT_ENUMS.transitions]);
    expect(schema.$defs.subtitle.properties.position.enum).toEqual([...PROJECT_ENUMS.subtitlePositions]);
    expect(schema.$defs.subtitle.properties.align.enum).toEqual([...PROJECT_ENUMS.subtitleAligns]);
  });

  it('agrees on required top-level and subtitle fields', () => {
    expect(schema.required).toEqual(['clips', 'resolution', 'aspectRatio']);
    expect(schema.$defs.subtitle.required).toEqual(['text', 'startTime', 'endTime']);
    // Clips deliberately have no hard-required fields (wire format is
    // tolerant; defaults apply), so the schema must not declare any.
    expect(schema.$defs.clip.required).toBeUndefined();
  });
});
