import { describe, it, expect } from 'vitest';
import { bgmTimeForPlayhead } from '@/lib/utils/bgm';

describe('bgmTimeForPlayhead — no trim region', () => {
  it('maps the playhead straight through when start is 0 and there is no end', () => {
    expect(bgmTimeForPlayhead(0, 0, null, null)).toBe(0);
    expect(bgmTimeForPlayhead(7.5, 0, null, null)).toBe(7.5);
  });

  it('never returns a negative seek position', () => {
    expect(bgmTimeForPlayhead(-3, 0, null, null)).toBe(0);
  });
});

describe('bgmTimeForPlayhead — trim start offset', () => {
  it('offsets into the file rather than delaying the BGM', () => {
    // Regression: bgmStartTime is a position *inside the BGM file*, not a
    // timeline offset. At playhead 0 the BGM must already be playing, from
    // second 5 of the file — not silent for the first 5 seconds.
    expect(bgmTimeForPlayhead(0, 5, null, null)).toBe(5);
    expect(bgmTimeForPlayhead(2, 5, null, null)).toBe(7);
  });

  it('clamps a negative trim start to the head of the file', () => {
    expect(bgmTimeForPlayhead(4, -10, null, null)).toBe(4);
  });

  it('applies the offset on top of the looped position', () => {
    // Trim [5, 15) is 10s long; playhead 12 wraps to 2s into the region.
    expect(bgmTimeForPlayhead(12, 5, 15, null)).toBeCloseTo(7);
  });
});

describe('bgmTimeForPlayhead — looping past the trim end', () => {
  it('wraps once the playhead exceeds the trim length', () => {
    // [10, 20) → 10s of usable audio.
    expect(bgmTimeForPlayhead(5, 10, 20, null)).toBeCloseTo(15);
    expect(bgmTimeForPlayhead(10, 10, 20, null)).toBeCloseTo(10);
    expect(bgmTimeForPlayhead(23, 10, 20, null)).toBeCloseTo(13);
  });

  it('wraps repeatedly over many loops', () => {
    // 100s playhead over a 4s region: 100 % 4 === 0, back to the region start.
    expect(bgmTimeForPlayhead(100, 1, 5, null)).toBeCloseTo(1);
    expect(bgmTimeForPlayhead(101.5, 1, 5, null)).toBeCloseTo(2.5);
  });

  it('stays inside [trimStart, trimEnd) for every playhead on a long timeline', () => {
    for (let t = 0; t < 60; t += 0.25) {
      const seek = bgmTimeForPlayhead(t, 3, 8, 30);
      expect(seek).toBeGreaterThanOrEqual(3);
      expect(seek).toBeLessThan(8);
    }
  });

  it('clamps a negative playhead inside a trim region to the region start', () => {
    // JS `%` keeps the sign of the dividend, so -1 % 10 is -1; the Math.max
    // guard is what stops that from seeking before the trim region.
    expect(bgmTimeForPlayhead(-1, 10, 20, null)).toBe(10);
  });
});

describe('bgmTimeForPlayhead — fileDuration fallback', () => {
  it('loops over the whole file when there is no explicit end but the duration is known', () => {
    expect(bgmTimeForPlayhead(12, 0, null, 10)).toBeCloseTo(2);
  });

  it('does not loop while the file duration is still null', () => {
    // Before metadata loads there is nothing to wrap against, so the playhead
    // passes through and the <audio> element simply runs out on its own.
    expect(bgmTimeForPlayhead(12, 0, null, null)).toBe(12);
    expect(bgmTimeForPlayhead(120, 2, null, null)).toBe(122);
  });

  it('ignores a file duration that is not past the trim start', () => {
    // fileDuration 4 with trimStart 5 is degenerate — treated as "no end".
    expect(bgmTimeForPlayhead(3, 5, null, 4)).toBe(8);
  });

  it('prefers an explicit end over the file duration', () => {
    // A 30s file trimmed to [0, 5) must wrap at 5, not at 30.
    expect(bgmTimeForPlayhead(7, 0, 5, 30)).toBeCloseTo(2);
  });
});

describe('bgmTimeForPlayhead — end at or before start', () => {
  it('treats an end before the start as no end at all', () => {
    expect(bgmTimeForPlayhead(4, 10, 4, null)).toBe(14);
  });

  it('treats an end equal to the start as no end at all', () => {
    expect(bgmTimeForPlayhead(4, 10, 10, null)).toBe(14);
  });

  it('does not fall back to the file duration when the end is degenerate', () => {
    // bgmEndTime is non-null, so fileDuration is never consulted; an inverted
    // trim therefore disables looping entirely rather than looping the file.
    expect(bgmTimeForPlayhead(50, 2, 1, 30)).toBe(52);
  });
});
