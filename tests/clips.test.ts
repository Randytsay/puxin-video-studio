import { describe, it, expect } from 'vitest';
import { reindexClips } from '@/lib/utils/clips';
import type { VideoClip } from '@/src/types';

function clip(overrides: Partial<VideoClip> = {}): VideoClip {
  return {
    plotName: 'plot',
    text: 'text',
    imageUrl: null,
    audioUrl: '',
    duration: 3,
    index: 0,
    totalClips: 1,
    ...overrides,
  };
}

describe('reindexClips', () => {
  it('renumbers index to the array position, 0..n-1', () => {
    const result = reindexClips([
      clip({ index: 7 }),
      clip({ index: 7 }),
      clip({ index: 7 }),
    ]);

    expect(result.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it('rewrites totalClips on every clip to the array length', () => {
    const result = reindexClips([clip({ totalClips: 99 }), clip({ totalClips: 99 })]);

    expect(result.map((c) => c.totalClips)).toEqual([2, 2]);
  });

  it('returns a new array — the input array identity is not reused', () => {
    const input = [clip(), clip()];
    const result = reindexClips(input);

    expect(result).not.toBe(input);
  });

  it('returns new clip objects rather than mutating the existing ones', () => {
    // Regression guard: undo history and useAppStore hold the *same* object
    // references as the live clip array, so `clip.index = i` would silently
    // rewrite every past snapshot. Each element must be a fresh object.
    const input = [clip(), clip()];
    const result = reindexClips(input);

    expect(result[0]).not.toBe(input[0]);
    expect(result[1]).not.toBe(input[1]);
  });

  it('leaves the input array and its elements untouched', () => {
    const input = [
      clip({ plotName: 'a', index: 5, totalClips: 42 }),
      clip({ plotName: 'b', index: 5, totalClips: 42 }),
    ];
    // Structural snapshot taken before the call, compared after.
    const before = JSON.parse(JSON.stringify(input));

    reindexClips(input);

    expect(input).toEqual(before);
  });

  it('a past history snapshot keeps its own indices after a later reindex', () => {
    // The scenario the doc comment describes end to end: a snapshot is pushed
    // to history, the live array is reordered and reindexed, and the snapshot
    // must still describe the old order.
    const a = clip({ plotName: 'a', index: 0, totalClips: 2 });
    const b = clip({ plotName: 'b', index: 1, totalClips: 2 });
    const snapshot = [a, b];

    reindexClips([b, a]);

    expect(snapshot.map((c) => [c.plotName, c.index])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });

  it('preserves every other field on the clip', () => {
    const [result] = reindexClips([
      clip({
        plotName: 'keep me',
        text: 'narration',
        imageUrl: '/img.png',
        audioUrl: '/a.mp3',
        duration: 4.5,
        audioStartTime: 1.2,
        transitionType: 'fade',
        scale: 1.5,
        position: { x: 10, y: -5 },
        index: 9,
      }),
    ]);

    expect(result).toEqual({
      plotName: 'keep me',
      text: 'narration',
      imageUrl: '/img.png',
      audioUrl: '/a.mp3',
      duration: 4.5,
      audioStartTime: 1.2,
      transitionType: 'fade',
      scale: 1.5,
      position: { x: 10, y: -5 },
      index: 0,
      totalClips: 1,
    });
  });

  it('returns an empty array for an empty input', () => {
    expect(reindexClips([])).toEqual([]);
  });

  it('sets totalClips to 1 for a single clip', () => {
    const [only] = reindexClips([clip({ index: 3, totalClips: 8 })]);

    expect(only.index).toBe(0);
    expect(only.totalClips).toBe(1);
  });
});
