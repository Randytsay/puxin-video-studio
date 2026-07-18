// Frame-grid layout for the clip timeline.
//
// This is the single place that turns per-clip second durations into frame
// spans. ProductVideo (the <Sequence> layout), Root.tsx (the composition
// length) and VideoEditor (the preview length) all derive from it, so they
// cannot drift apart.
//
// Why not `ceil(start)` and `ceil(duration)` independently, as the three call
// sites used to do: because ceil(a+b) ≤ ceil(a)+ceil(b), so a clip's rounded-up
// length could push past where the next clip's rounded-up start lands. Two 0.55s
// clips at 30fps gave spans 0..16 and 17..33, while the third clip started at
// ceil(1.1*30)=33 — a frame where two clips were mounted at once, audible as
// two overlapping <Audio> tracks. Summing the per-clip ceils also disagreed with
// ceil(totalDuration), leaving a trailing black frame.
//
// Instead we round the *cumulative* boundary and give each clip the frames
// between consecutive boundaries: spans always tile exactly, with no gap and
// no overlap, and their sum is the composition length by construction.

export const VIDEO_FPS = 30;

/** Fallback used throughout the app when a clip carries no explicit duration. */
export const DEFAULT_CLIP_DURATION_SECONDS = 3.0;

export interface ClipFrameSpan {
  startFrame: number;
  durationInFrames: number;
}

interface HasDuration {
  duration?: number;
}

export function computeClipFrameSpans(
  clips: readonly HasDuration[],
  fps: number = VIDEO_FPS,
): ClipFrameSpan[] {
  const safeFps = fps > 0 ? fps : VIDEO_FPS;
  const spans: ClipFrameSpan[] = [];
  let elapsedSeconds = 0;
  let nextStartFrame = 0;

  for (const clip of clips) {
    elapsedSeconds += clip.duration || DEFAULT_CLIP_DURATION_SECONDS;
    const boundaryFrame = Math.round(elapsedSeconds * safeFps);
    const startFrame = nextStartFrame;
    // Every clip occupies at least one frame, so a degenerate 0s clip cannot
    // make a later clip start before an earlier one.
    const durationInFrames = Math.max(1, boundaryFrame - startFrame);
    spans.push({ startFrame, durationInFrames });
    nextStartFrame = startFrame + durationInFrames;
  }

  return spans;
}

/** Total frames covered by the clips — exactly the sum of the spans. */
export function computeTotalFrames(
  clips: readonly HasDuration[],
  fps: number = VIDEO_FPS,
): number {
  const spans = computeClipFrameSpans(clips, fps);
  if (spans.length === 0) return 0;
  const last = spans[spans.length - 1];
  return last.startFrame + last.durationInFrames;
}
