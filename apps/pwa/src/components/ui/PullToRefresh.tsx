import { useState, useRef, useCallback, type ReactNode } from 'react';

interface PullToRefreshProps {
  onRefresh: () => void | Promise<unknown>;
  children: ReactNode;
}

const THRESHOLD = 60;

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0]!.clientY;
      setPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling || refreshing) return;
      const currentY = e.touches[0]!.clientY;
      const distance = Math.max(0, currentY - startY.current);
      setPullDistance(Math.min(distance, THRESHOLD * 2));
    },
    [pulling, refreshing],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    setPulling(false);

    if (pullDistance >= THRESHOLD) {
      setRefreshing(true);
      setPullDistance(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pulling, pullDistance, onRefresh]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
      data-testid="pull-to-refresh"
    >
      {pullDistance > 0 && (
        <div
          className="flex items-center justify-center overflow-hidden transition-[height]"
          style={{ height: pullDistance }}
          data-testid="pull-indicator"
        >
          <i
            className={`mdi ${refreshing ? 'mdi-loading mdi-spin' : 'mdi-arrow-down'} text-xl text-primary`}
          />
        </div>
      )}
      {children}
    </div>
  );
}
