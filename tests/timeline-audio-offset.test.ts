import { describe, it, expect } from 'vitest';
import { NARRATION_PLAYBACK_RATE, timelineToAudioOffset } from '@/src/timeline';

describe('NARRATION_PLAYBACK_RATE', () => {
  it('is exported as 1.2 — narration plays 20% faster than the timeline', () => {
    expect(NARRATION_PLAYBACK_RATE).toBe(1.2);
  });

  it('is faster than real time, so the audio file is consumed ahead of the timeline', () => {
    expect(NARRATION_PLAYBACK_RATE).toBeGreaterThan(1);
  });
});

describe('timelineToAudioOffset', () => {
  it('maps the start of a clip to the start of the audio', () => {
    expect(timelineToAudioOffset(0)).toBe(0);
  });

  it('consumes NARRATION_PLAYBACK_RATE seconds of audio per timeline second', () => {
    expect(timelineToAudioOffset(1)).toBeCloseTo(1.2);
    expect(timelineToAudioOffset(2.5)).toBeCloseTo(3);
    expect(timelineToAudioOffset(10)).toBeCloseTo(12);
  });

  it('is exactly the timeline offset scaled by the exported rate', () => {
    for (const t of [0.1, 0.75, 3, 7.25, 42]) {
      expect(timelineToAudioOffset(t)).toBeCloseTo(t * NARRATION_PLAYBACK_RATE);
    }
  });

  it('cutting a clip at t seconds skips more audio than t', () => {
    // Regression: cutting used to do `audioStartTime += t`, which left ~20% of
    // the narration to be replayed at the head of the second half.
    const cutAt = 5;
    expect(timelineToAudioOffset(cutAt)).toBeGreaterThan(cutAt);
    expect(timelineToAudioOffset(cutAt) - cutAt).toBeCloseTo(1);
  });

  it('is linear — offsets compose additively', () => {
    expect(timelineToAudioOffset(2) + timelineToAudioOffset(3)).toBeCloseTo(
      timelineToAudioOffset(5),
    );
  });
});
