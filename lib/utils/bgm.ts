// BGM trim maths, shared by the preview's out-of-band <audio> element and kept
// deliberately equivalent to the renderer's <Audio startFrom endAt loop> in
// src/ProductVideo.tsx.
//
// `bgmStartTime` / `bgmEndTime` describe a trim region *inside the BGM file*,
// not an offset on the video timeline: the BGM starts at the very beginning of
// the video and loops over [bgmStartTime, bgmEndTime] of the file. Two of the
// preview's three code paths used to read them as a timeline offset, which
// muted the first N seconds of the video and then played the part of the file
// the user had trimmed away — the exact opposite of the exported result.

/**
 * Playhead position (seconds from the start of the video) → the position to
 * seek the BGM audio element to (seconds into the BGM file).
 *
 * @param fileDuration total length of the BGM file, or null if not yet known.
 */
export function bgmTimeForPlayhead(
  playerTime: number,
  bgmStartTime: number,
  bgmEndTime: number | null,
  fileDuration: number | null,
): number {
  const trimStart = Math.max(0, bgmStartTime);
  const rawEnd = bgmEndTime !== null ? bgmEndTime : fileDuration;
  const trimEnd = rawEnd !== null && rawEnd > trimStart ? rawEnd : null;
  const trimLength = trimEnd !== null ? trimEnd - trimStart : null;

  // Past the end of the trim region the renderer loops, so the preview does too.
  const offsetInTrim =
    trimLength !== null && trimLength > 0 ? playerTime % trimLength : playerTime;

  return trimStart + Math.max(0, offsetInTrim);
}
