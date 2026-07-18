// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDragSession } from '@/components/editor/hooks/useDragSession';

function mouse(type: 'mousemove' | 'mouseup') {
  return new MouseEvent(type, { bubbles: true });
}

let addSpy: ReturnType<typeof vi.spyOn>;
let removeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  addSpy = vi.spyOn(document, 'addEventListener');
  removeSpy = vi.spyOn(document, 'removeEventListener');
  addSpy.mockClear();
  removeSpy.mockClear();
});

describe('useDragSession', () => {
  it('forwards mousemove to onMove while the drag is active', () => {
    const { result } = renderHook(() => useDragSession());
    const onMove = vi.fn();

    act(() => result.current.start(onMove));
    document.dispatchEvent(mouse('mousemove'));
    document.dispatchEvent(mouse('mousemove'));

    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('calls onEnd and detaches on mouseup', () => {
    const { result } = renderHook(() => useDragSession());
    const onMove = vi.fn();
    const onEnd = vi.fn();

    act(() => result.current.start(onMove, onEnd));
    document.dispatchEvent(mouse('mouseup'));
    expect(onEnd).toHaveBeenCalledTimes(1);

    // Post-mouseup movement must not reach the handler.
    document.dispatchEvent(mouse('mousemove'));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('stop() detaches without invoking onEnd', () => {
    const { result } = renderHook(() => useDragSession());
    const onMove = vi.fn();
    const onEnd = vi.fn();

    act(() => result.current.start(onMove, onEnd));
    act(() => result.current.stop());

    document.dispatchEvent(mouse('mousemove'));
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('starting again replaces the previous session rather than stacking it', () => {
    const { result } = renderHook(() => useDragSession());
    const first = vi.fn();
    const second = vi.fn();

    act(() => result.current.start(first));
    act(() => result.current.start(second));
    document.dispatchEvent(mouse('mousemove'));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  // The regression this hook exists to prevent: ModernTimeline's hand-rolled
  // cleanup omitted two of its four drag kinds, so unmounting mid-drag left
  // listeners bound to document forever.
  it('detaches on unmount even while a drag is still in flight', () => {
    const { result, unmount } = renderHook(() => useDragSession());
    const onMove = vi.fn();

    act(() => result.current.start(onMove));
    unmount(); // no mouseup — the drag is still active

    document.dispatchEvent(mouse('mousemove'));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('adds and removes with matching capture flags', () => {
    const { result, unmount } = renderHook(() => useDragSession({ capture: true }));

    const isDragListener = (call: unknown[]) =>
      call[0] === 'mousemove' || call[0] === 'mouseup';

    act(() => result.current.start(vi.fn()));
    const added = (addSpy.mock.calls as unknown[][]).filter(isDragListener);
    expect(added).toHaveLength(2);
    expect(added.every((call) => call[2] === true)).toBe(true);

    unmount();
    const removed = (removeSpy.mock.calls as unknown[][]).filter(isDragListener);
    expect(removed).toHaveLength(2);
    expect(removed.every((call) => call[2] === true)).toBe(true);
  });
});
