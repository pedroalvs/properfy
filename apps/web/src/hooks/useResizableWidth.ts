import { useCallback, useEffect, useRef, useState } from 'react';

interface UseResizableWidthOptions {
  /** Initial width in pixels. */
  initialPx?: number;
  /** Minimum allowed width in pixels. */
  minPx?: number;
  /** Maximum allowed width in pixels. */
  maxPx?: number;
  /** sessionStorage key for persistence across page reloads. */
  storageKey?: string;
  /**
   * Which edge the resize handle sits on.
   * 'left' (default): handle is on the left edge; dragging left = wider.
   * 'right': handle is on the right edge; dragging right = wider.
   */
  direction?: 'left' | 'right';
}

interface UseResizableWidthReturn {
  widthPx: number;
  isDragging: boolean;
  /** Attach to the resize handle element's onMouseDown. */
  onHandleMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Drag-to-resize hook for panel widths.
 * Persists the chosen width in sessionStorage when a storageKey is provided.
 * Clamped to [minPx, maxPx] on every update and on read from storage.
 */
export function useResizableWidth({
  initialPx = 480,
  minPx = 360,
  maxPx = Math.round(window.innerWidth * 0.9),
  storageKey,
  direction = 'left',
}: UseResizableWidthOptions = {}): UseResizableWidthReturn {
  const clamp = (v: number) => Math.min(maxPx, Math.max(minPx, v));

  const [widthPx, setWidthPx] = useState<number>(() => {
    if (storageKey) {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!Number.isNaN(parsed)) return clamp(parsed);
      }
    }
    return clamp(initialPx);
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef<number>(0);
  const dragStartWidth = useRef<number>(0);

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartWidth.current = widthPx;
    setIsDragging(true);
  }, [widthPx]);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta = direction === 'right'
        ? e.clientX - dragStartX.current   // right-edge: dragging right = wider
        : dragStartX.current - e.clientX;  // left-edge: dragging left = wider
      const next = clamp(dragStartWidth.current + delta);
      setWidthPx(next);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      if (storageKey) {
        sessionStorage.setItem(storageKey, String(widthPx));
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, storageKey, widthPx]);

  return { widthPx, isDragging, onHandleMouseDown };
}
