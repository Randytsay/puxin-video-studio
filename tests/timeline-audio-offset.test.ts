import { describe, it, expect } from 'vitest';
import { NARRATION_PLAYBACK_RATE, timelineToAudioOffset } from '@/src/timeline';

describe('NARRATION_PLAYBACK_RATE', () => {
  it('uses natural 1.0x playback for Puxin narration', () => {
    expect(NARRATION_PLAYBACK_RATE).toBe(1);
  });

  it('keeps narration time aligned with timeline time', () => {
    expect(NARRATION_PLAYBACK_RATE).toBe(1);
  });
});

describe('timelineToAudioOffset', () => {
  it('maps the start of a clip to the start of the audio', () => {
    expect(timelineToAudioOffset(0)).toBe(0);
  });

  it('consumes NARRATION_PLAYBACK_RATE seconds of audio per timeline second', () => {
    expect(timelineToAudioOffset(1)).toBeCloseTo(1);
    expect(timelineToAudioOffset(2.5)).toBeCloseTo(2.5);
    expect(timelineToAudioOffset(10)).toBeCloseTo(10);
  });

  it('is exactly the timeline offset scaled by the exported rate', () => {
    for (const t of [0.1, 0.75, 3, 7.25, 42]) {
      expect(timelineToAudioOffset(t)).toBeCloseTo(t * NARRATION_PLAYBACK_RATE);
    }
  });

  it('cutting a clip at t seconds skips the same amount of narration', () => {
    const cutAt = 5;
    expect(timelineToAudioOffset(cutAt)).toBeCloseTo(cutAt);
  });

  it('is linear — offsets compose additively', () => {
    expect(timelineToAudioOffset(2) + timelineToAudioOffset(3)).toBeCloseTo(
      timelineToAudioOffset(5),
    );
  });
});
