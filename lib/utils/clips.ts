// Clip array helpers shared by VideoEditor and the extracted clip hooks.

import type { VideoClip } from '@/src/types';

/**
 * Return a new array of new clip objects with `index` / `totalClips` rewritten
 * to match array position.
 *
 * Every mutation path (reorder, delete, cut, split) must go through this
 * instead of mutating clips in place. Undo history and `useAppStore` hold the
 * *same object references* as the live array, so `clip.index = i` silently
 * rewrites every past snapshot — undoing a reorder would restore the array
 * order while leaving the stale indices behind, and ProductVideo picks its
 * layout from `clip.index`.
 */
export function reindexClips(clips: VideoClip[]): VideoClip[] {
  return clips.map((clip, index) => ({
    ...clip,
    index,
    totalClips: clips.length,
  }));
}
