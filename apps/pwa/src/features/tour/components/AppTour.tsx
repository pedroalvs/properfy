import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@properfy/frontend-standards';
import { Button } from '@/components/ui/Button';
import { CoachOverlay } from '@/components/ui/CoachOverlay';
import type { TourStep } from '../lib/tour-steps';
import { computeTourGeometry, type Rect } from '../lib/tour-geometry';
import { handleFocusTrapKeyDown } from '../lib/focus-trap';
import { useTargetRect } from '../hooks/useTargetRect';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { InstallStepBody } from './InstallStepBody';

export interface AppTourProps {
  /** The resolved step list (install already included/excluded by `resolveTourSteps`). */
  steps: TourStep[];
  onFinish: (reason: 'completed' | 'skipped') => void;
}

type Direction = 'forward' | 'back';

function readInset(name: string): number {
  if (typeof window === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The coach-mark tour: a dimmed overlay with a spotlight cut-out (via a large
 * box-shadow, not clip-path — research D2) and an anchored balloon. Self-contained
 * (no tour library): custom focus trap, `inert` background, reduced-motion aware,
 * and absent-target skipping with a recomputed step count.
 */
export function AppTour({ steps, onFinish }: AppTourProps) {
  const [index, setIndex] = useState(0);
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(() => new Set());
  const [direction, setDirection] = useState<Direction>('forward');
  const [finished, setFinished] = useState(false);

  const titleId = useId();
  const bodyId = useId();
  const reducedMotion = usePrefersReducedMotion();
  const nextRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const current = steps[index] as TourStep | undefined;
  const anchor = current && current.kind === 'target' ? (current.anchor ?? null) : null;
  const target = useTargetRect(anchor, !finished && current?.kind === 'target');

  const finish = useCallback(
    (reason: 'completed' | 'skipped') => {
      if (finished) return;
      setFinished(true);
      onFinish(reason);
    },
    [finished, onFinish],
  );

  const nextVisible = useCallback(
    (from: number, dir: Direction, skip: ReadonlySet<number>): number => {
      let i = from + (dir === 'forward' ? 1 : -1);
      while (i >= 0 && i < steps.length && skip.has(i)) i += dir === 'forward' ? 1 : -1;
      return i;
    },
    [steps.length],
  );

  // Skip the current step when its target settled as absent, moving in the travel
  // direction. Install steps are never skipped.
  useEffect(() => {
    if (finished || !current || current.kind === 'install') return;
    if (!target.resolved || target.isVisible) return;

    const nextSkipped = new Set(skipped);
    nextSkipped.add(index);
    setSkipped(nextSkipped);

    const forward = nextVisible(index, 'forward', nextSkipped);
    const back = nextVisible(index, 'back', nextSkipped);
    if (direction === 'back') {
      if (back >= 0) setIndex(back);
      else if (forward < steps.length) {
        setIndex(forward);
        setDirection('forward');
      } else finish('completed');
    } else if (forward < steps.length) setIndex(forward);
    else finish('completed');
  }, [current, target.resolved, target.isVisible, finished, index, skipped, direction, nextVisible, steps.length, finish]);

  const showBalloon =
    !finished && !!current && (current.kind === 'install' || (target.resolved && target.isVisible));

  // Capture prior focus + make the background inert while open; always restore.
  useEffect(() => {
    const root = document.getElementById('root');
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (root) {
      root.setAttribute('aria-hidden', 'true');
      root.setAttribute('inert', '');
    }
    return () => {
      if (root) {
        root.removeAttribute('aria-hidden');
        root.removeAttribute('inert');
      }
      previouslyFocused?.focus?.();
    };
  }, []);

  // Focus the primary action when a step's balloon appears.
  useEffect(() => {
    if (showBalloon) nextRef.current?.focus();
  }, [index, showBalloon]);

  // Scroll an off-screen target into view when it becomes current.
  useEffect(() => {
    if (!showBalloon || !anchor || !target.isVisible) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
    el?.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [anchor, showBalloon, target.isVisible, reducedMotion]);

  const position = useMemo(() => {
    let count = 0;
    for (let i = 0; i <= index && i < steps.length; i++) if (!skipped.has(i)) count += 1;
    return count;
  }, [index, skipped, steps.length]);
  const total = steps.length - skipped.size;
  const hasNext = nextVisible(index, 'forward', skipped) < steps.length;
  const hasBack = nextVisible(index, 'back', skipped) >= 0;

  const goNext = () => {
    const i = nextVisible(index, 'forward', skipped);
    if (i >= steps.length) finish('completed');
    else {
      setDirection('forward');
      setIndex(i);
    }
  };
  const goBack = () => {
    const i = nextVisible(index, 'back', skipped);
    if (i >= 0) {
      setDirection('back');
      setIndex(i);
    }
  };

  const viewport = {
    width: typeof window !== 'undefined' ? window.innerWidth : 390,
    height: typeof window !== 'undefined' ? window.innerHeight : 844,
  };
  const geometry = computeTourGeometry({
    targetRect: current?.kind === 'install' ? null : (target.rect as Rect | null),
    viewport,
    insets: { safeTop: readInset('--safe-area-top'), safeBottom: readInset('--safe-area-bottom') },
  });

  // Nothing once finished; a plain dimmed overlay while a target is still resolving.
  if (finished || !current) return null;
  if (!showBalloon) return <CoachOverlay spotlight={null} animate={false} />;

  const transition = reducedMotion ? '' : 'transition-all duration-200';

  return (
    <CoachOverlay spotlight={geometry.spotlight} animate={!reducedMotion}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            finish('skipped');
            return;
          }
          if (dialogRef.current) handleFocusTrapKeyDown(dialogRef.current, e.nativeEvent);
        }}
        className={cn(
          'absolute rounded-card border border-border bg-card p-4 shadow-lg',
          transition,
        )}
        style={{
          left: geometry.balloon.left,
          top: geometry.balloon.top,
          width: `min(320px, 100vw - 32px)`,
        }}
      >
        <h2 id={titleId} className="text-base font-bold text-foreground">
          {current.title}
        </h2>
        <div id={bodyId} className="mt-1">
          {current.kind === 'install' ? (
            <InstallStepBody />
          ) : (
            <p className="text-sm text-muted-foreground">{current.body}</p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span aria-live="polite" className="text-xs font-medium text-muted-foreground">
            Step {position} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => finish('skipped')}
              className={cn(
                'min-h-touch rounded-btn px-3 text-sm font-semibold text-muted-foreground',
                'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              Skip
            </button>
            <Button
              variant="secondary"
              className="min-h-touch px-4"
              disabled={!hasBack}
              onClick={goBack}
            >
              Back
            </Button>
            <Button ref={nextRef} variant="primary" className="min-h-touch px-4" onClick={goNext}>
              {hasNext ? 'Next' : 'Done'}
            </Button>
          </div>
        </div>
      </div>
    </CoachOverlay>
  );
}
