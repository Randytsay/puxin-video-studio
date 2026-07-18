'use client';

import { useCallback, useEffect, useRef } from 'react';

type MoveHandler = (e: MouseEvent) => void;
type EndHandler = (e: MouseEvent) => void;

export interface DragSession {
  /**
   * Begin a drag. Any session already running on this instance is stopped
   * first, and the listeners detach automatically on mouseup.
   */
  start: (onMove: MoveHandler, onEnd?: EndHandler) => void;
  /** Detach immediately. Safe to call when nothing is attached. */
  stop: () => void;
}

/**
 * Owns one document-level mouse drag: attach on mousedown, follow on
 * mousemove, detach on mouseup — and, critically, detach on unmount.
 *
 * ModernTimeline previously open-coded this sequence four times (clip resize,
 * subtitle resize, subtitle drag, playhead pin). Each copy stored its handlers
 * in its own ref, and the component's unmount cleanup listed only two of the
 * four — so unmounting mid-drag left the playhead and clip-resize handlers
 * bound to `document` forever, holding the component closure alive and firing
 * callbacks into a dead tree. Cleanup lives here now, so a new drag kind gets
 * it by construction instead of by remembering.
 *
 * `capture` must match between add and remove, which is why it is fixed per
 * instance rather than passed per call (the pin drag listens in capture phase).
 */
export function useDragSession(options: { capture?: boolean } = {}): DragSession {
  const capture = options.capture ?? false;
  const handlersRef = useRef<{ move: MoveHandler | null; up: EndHandler | null }>({
    move: null,
    up: null,
  });

  const stop = useCallback(() => {
    const { move, up } = handlersRef.current;
    if (move) document.removeEventListener('mousemove', move, capture);
    if (up) document.removeEventListener('mouseup', up, capture);
    handlersRef.current = { move: null, up: null };
  }, [capture]);

  const start = useCallback(
    (onMove: MoveHandler, onEnd?: EndHandler) => {
      stop();
      const move: MoveHandler = (e) => onMove(e);
      const up: EndHandler = (e) => {
        onEnd?.(e);
        stop();
      };
      handlersRef.current = { move, up };
      document.addEventListener('mousemove', move, capture);
      document.addEventListener('mouseup', up, capture);
    },
    [capture, stop],
  );

  // `capture` is fixed per instance, so `stop` is stable and this effect runs
  // its cleanup only on unmount.
  useEffect(() => stop, [stop]);

  return { start, stop };
}
