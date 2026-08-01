import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/lib/store';
import type { Scenario } from '@/lib/types';
import type { VideoClip } from '@/src/types';

/** State entries that carry data, i.e. everything that is not an action. */
function dataOf(state: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).filter(([, value]) => typeof value !== 'function'),
  );
}

// Captured at module load, before any test has touched the store, so it is the
// literal the store was created with rather than whatever reset() produces.
const INITIAL_STATE = dataOf(useAppStore.getState() as unknown as Record<string, unknown>);

function clip(plotName: string): VideoClip {
  return {
    plotName,
    text: '',
    imageUrl: null,
    audioUrl: '',
    duration: 3,
    index: 0,
    totalClips: 1,
  };
}

function scenario(...contents: string[]): Scenario {
  return {
    templateType: 'PAS',
    plots: contents.map((content, index) => ({
      name: `plot-${index}`,
      content,
      index,
    })),
  };
}

beforeEach(() => {
  useAppStore.getState().reset();
});

describe('setVideoDuration', () => {
  it('snaps a value already in range to the nearest multiple of 3', () => {
    const cases: [number, number][] = [
      [3, 3],
      [4, 3], // 4/3 = 1.33 → 1 → 3
      [5, 6], // 5/3 = 1.67 → 2 → 6
      [9, 9],
      [10, 9],
      [11, 12],
      [15, 15],
    ];

    for (const [input, expected] of cases) {
      useAppStore.getState().setVideoDuration(input);
      expect(useAppStore.getState().videoDuration).toBe(expected);
    }
  });

  it('rounds a halfway value up (Math.round semantics)', () => {
    // 4.5 / 3 = 1.5 → 2 → 6
    useAppStore.getState().setVideoDuration(4.5);
    expect(useAppStore.getState().videoDuration).toBe(6);
  });

  it('clamps below 3 up to the 3 second minimum', () => {
    for (const input of [2.9, 0, -100]) {
      useAppStore.getState().setVideoDuration(input);
      expect(useAppStore.getState().videoDuration).toBe(3);
    }
  });

  it('clamps above 30 down to the 30 second maximum', () => {
    for (const input of [30.1, 45, 100000]) {
      useAppStore.getState().setVideoDuration(input);
      expect(useAppStore.getState().videoDuration).toBe(30);
    }
  });

  it('never leaves a value outside 3..30 or off the 3 second grid', () => {
    for (let input = -10; input <= 50; input += 0.5) {
      useAppStore.getState().setVideoDuration(input);
      const stored = useAppStore.getState().videoDuration;
      expect(stored).toBeGreaterThanOrEqual(3);
      expect(stored).toBeLessThanOrEqual(30);
      expect(stored % 3).toBe(0);
    }
  });
});

describe('setBgmVolume', () => {
  it('stores an in-range volume unchanged', () => {
    useAppStore.getState().setBgmVolume(0.42);
    expect(useAppStore.getState().bgmVolume).toBe(0.42);
  });

  it('keeps the inclusive bounds', () => {
    useAppStore.getState().setBgmVolume(0);
    expect(useAppStore.getState().bgmVolume).toBe(0);
    useAppStore.getState().setBgmVolume(1);
    expect(useAppStore.getState().bgmVolume).toBe(1);
  });

  it('clamps a negative volume to 0', () => {
    useAppStore.getState().setBgmVolume(-2);
    expect(useAppStore.getState().bgmVolume).toBe(0);
  });

  it('clamps a volume above 1 to 1', () => {
    useAppStore.getState().setBgmVolume(9);
    expect(useAppStore.getState().bgmVolume).toBe(1);
  });
});

describe('updatePlot', () => {
  it('does nothing when there is no scenario', () => {
    useAppStore.getState().updatePlot(0, 'hello');
    expect(useAppStore.getState().scenario).toBeNull();
  });

  it('updates an existing plot in place, preserving its other fields', () => {
    useAppStore.getState().setScenario(scenario('first', 'second'));
    useAppStore.getState().updatePlot(1, 'rewritten');

    const plots = useAppStore.getState().scenario!.plots;
    expect(plots[1]).toEqual({ name: 'plot-1', content: 'rewritten', index: 1 });
    expect(plots[0].content).toBe('first');
  });

  it('creates a blank-named plot when the index has no plot yet', () => {
    useAppStore.getState().setScenario(scenario('first'));
    useAppStore.getState().updatePlot(1, 'appended');

    const plots = useAppStore.getState().scenario!.plots;
    expect(plots).toHaveLength(2);
    expect(plots[1]).toEqual({ name: '', content: 'appended', index: 1 });
  });

  it('fills a gap with holes when the index is past the end of the array', () => {
    // Documenting real behaviour: the assignment is a plain indexed write, so
    // writing at index 3 of a 1-element array extends the array and leaves the
    // intervening slots empty rather than filling them with blank plots.
    useAppStore.getState().setScenario(scenario('first'));
    useAppStore.getState().updatePlot(3, 'far away');

    const plots = useAppStore.getState().scenario!.plots;
    expect(plots).toHaveLength(4);
    expect(plots[3]).toEqual({ name: '', content: 'far away', index: 3 });
    expect(plots[1]).toBeUndefined();
    expect(plots[2]).toBeUndefined();
  });

  it('does not mutate the plots array it was given', () => {
    const original = scenario('first');
    const originalPlots = original.plots;
    useAppStore.getState().setScenario(original);
    useAppStore.getState().updatePlot(0, 'changed');

    expect(originalPlots[0].content).toBe('first');
    expect(useAppStore.getState().scenario!.plots).not.toBe(originalPlots);
  });

  it('keeps the rest of the scenario intact', () => {
    useAppStore.getState().setScenario({ ...scenario('first'), id: 'sc-1', templateType: 'FBE' });
    useAppStore.getState().updatePlot(0, 'changed');

    const next = useAppStore.getState().scenario!;
    expect(next.id).toBe('sc-1');
    expect(next.templateType).toBe('FBE');
  });
});

describe('reset', () => {
  /** Push every data field away from its initial value. */
  function dirtyEveryField() {
    const s = useAppStore.getState();
    s.setClips([clip('a')]);
    s.setProductData({ name: 'p', description: 'd', images: ['/i.png'], reviews: [] });
    s.setSelectedTemplate('BEFORE_AFTER');
    s.setScenario(scenario('first'));
    s.setVideoUrl('/out.mp4');
    s.setVideoDuration(30);
    s.setVideoResolution('720p');
    s.setVideoAspectRatio('9:16');
    s.setVideoTempo(2);
    s.setAudioEnabled(false);
    s.setBgmUrl('/bgm.mp3');
    s.setBgmVolume(0.95);
  }

  it('the dirty fixture really does change every field (guards the test below)', () => {
    dirtyEveryField();
    const dirty = dataOf(useAppStore.getState() as unknown as Record<string, unknown>);

    expect(Object.keys(INITIAL_STATE).length).toBeGreaterThan(0);
    expect(Object.keys(dirty).sort()).toEqual(Object.keys(INITIAL_STATE).sort());
    for (const key of Object.keys(INITIAL_STATE)) {
      expect(dirty[key], `${key} was not dirtied, so reset() is untested for it`).not.toEqual(
        INITIAL_STATE[key],
      );
    }
  });

  it('restores every data field to its initial value', () => {
    // Guards the hand-maintained literal inside reset() against drifting from
    // the initial-state literal the store is created with: any field added to
    // one and not the other fails here.
    dirtyEveryField();
    useAppStore.getState().reset();

    expect(dataOf(useAppStore.getState() as unknown as Record<string, unknown>)).toEqual(
      INITIAL_STATE,
    );
  });

  it('leaves the actions in place', () => {
    useAppStore.getState().reset();
    expect(typeof useAppStore.getState().setClips).toBe('function');
    expect(typeof useAppStore.getState().reset).toBe('function');
  });
});

describe('setClips', () => {
  it('accepts a plain array', () => {
    useAppStore.getState().setClips([clip('a')]);
    expect(useAppStore.getState().clips.map((c) => c.plotName)).toEqual(['a']);
  });

  it('accepts a functional update derived from the latest clips', () => {
    useAppStore.getState().setClips([clip('a')]);
    useAppStore.getState().setClips((prev) => [...prev, clip('b')]);
    expect(useAppStore.getState().clips.map((c) => c.plotName)).toEqual(['a', 'b']);
  });
});
