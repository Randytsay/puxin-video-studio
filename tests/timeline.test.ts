import { describe, it, expect } from 'vitest';
import {
  computeClipFrameSpans,
  computeTotalFrames,
  VIDEO_FPS,
} from '@/src/timeline';

const clips = (...durations: number[]) => durations.map((duration) => ({ duration }));

describe('computeClipFrameSpans', () => {
  it('produces spans that tile exactly — no gap, no overlap', () => {
    // Regression: independently ceil-ing start and duration made 0.55s clips
    // overlap on a frame, mounting two <Audio> tracks at once.
    const spans = computeClipFrameSpans(clips(0.55, 0.55, 0.55, 0.55));

    for (let i = 1; i < spans.length; i++) {
      const prev = spans[i - 1];
      expect(spans[i].startFrame).toBe(prev.startFrame + prev.durationInFrames);
    }
  });

  it('keeps cumulative drift bounded rather than accumulating it', () => {
    // 100 clips of 1/3s: naive per-clip rounding drifts badly; cumulative
    // boundaries stay within a frame of the true elapsed time throughout.
    const spans = computeClipFrameSpans(clips(...Array(100).fill(1 / 3)));

    spans.forEach((span, i) => {
      const trueElapsedFrames = ((i + 1) / 3) * VIDEO_FPS;
      const spanEnd = span.startFrame + span.durationInFrames;
      expect(Math.abs(spanEnd - trueElapsedFrames)).toBeLessThanOrEqual(1);
    });
  });

  it('gives a degenerate 0s clip one frame without reordering neighbours', () => {
    const spans = computeClipFrameSpans([{ duration: 1 }, { duration: 0 }, { duration: 1 }]);

    expect(spans[1].durationInFrames).toBeGreaterThanOrEqual(1);
    expect(spans[2].startFrame).toBeGreaterThan(spans[1].startFrame);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].startFrame).toBe(spans[i - 1].startFrame + spans[i - 1].durationInFrames);
    }
  });

  it('defaults a missing duration to 3 seconds', () => {
    const [span] = computeClipFrameSpans([{}]);
    expect(span.durationInFrames).toBe(3 * VIDEO_FPS);
  });

  it('starts the first clip at frame 0', () => {
    expect(computeClipFrameSpans(clips(2, 2))[0].startFrame).toBe(0);
  });

  it('returns an empty layout for no clips', () => {
    expect(computeClipFrameSpans([])).toEqual([]);
  });
});

describe('computeTotalFrames', () => {
  it('equals the sum of the spans, so the composition has no trailing gap', () => {
    // Three 1.1s clips: ceil(1.1*30)*3 = 99 but ceil(3.3*30) = 100 — the old
    // mismatch that left a black frame at the end.
    const list = clips(1.1, 1.1, 1.1);
    const spans = computeClipFrameSpans(list);
    const summed = spans.reduce((n, s) => n + s.durationInFrames, 0);

    expect(computeTotalFrames(list)).toBe(summed);
    expect(computeTotalFrames(list)).toBe(99);
  });

  it('is 0 for no clips', () => {
    expect(computeTotalFrames([])).toBe(0);
  });

  it('honours a custom fps', () => {
    expect(computeTotalFrames(clips(2), 60)).toBe(120);
  });

  it('falls back to the default fps when given a non-positive one', () => {
    expect(computeTotalFrames(clips(2), 0)).toBe(2 * VIDEO_FPS);
  });
});
