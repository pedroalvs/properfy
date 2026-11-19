import { useEffect, useState } from 'react';
import type { Rect } from '../lib/tour-geometry';

export interface TargetRectResult {
  /** The measured target rect, or `null` while unresolved / for a centered step. */
  rect: Rect | null;
  /** True once the target was found and has a non-empty box. */
  isVisible: boolean;
  /** True once resolution settled (found, or timed out without a target). */
  resolved: boolean;
}

/** Default wait for a late-mounting target before the step is treated as absent. */
export const TARGET_WAIT_MS = 500;

function measure(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function isNonEmpty(rect: Rect): boolean {
  return rect.w > 0 && rect.h > 0;
}

/**
 * Resolve and track the viewport rect of the current step's `[data-tour]` anchor.
 * A `null` anchor is a centered step (resolved immediately, not visible). A missing
 * anchor is awaited up to {@link TARGET_WAIT_MS} via a MutationObserver, then the
 * step is reported unresolved-but-settled (`resolved: true, isVisible: false`) so
 * the component can skip it. While visible, the rect is re-measured on
 * resize/scroll/orientationchange via `requestAnimationFrame`.
 */
export function useTargetRect(anchor: string | null, active: boolean): TargetRectResult {
  const [state, setState] = useState<TargetRectResult & { anchor: string | null }>({
    anchor,
    rect: null,
    isVisible: false,
    resolved: anchor === null,
  });

  // Adjust state during render when the anchor changes, so a stale previous-step
  // result can never be read as the new step's (which would wrongly skip it).
  if (state.anchor !== anchor) {
    setState({ anchor, rect: null, isVisible: false, resolved: anchor === null });
  }

  const setResult = (next: TargetRectResult) => setState({ ...next, anchor });
  const result: TargetRectResult = { rect: state.rect, isVisible: state.isVisible, resolved: state.resolved };

  useEffect(() => {
    if (!active) return undefined;
    if (anchor === null) {
      setResult({ rect: null, isVisible: false, resolved: true });
      return undefined;
    }

    let frame = 0;
    let timeout = 0;
    let settled = false;
    const selector = `[data-tour="${anchor}"]`;

    const remeasure = () => {
      const el = document.querySelector(selector);
      if (!el) return;
      const rect = measure(el);
      settled = true;
      setResult({ rect, isVisible: isNonEmpty(rect), resolved: true });
    };

    const scheduleRemeasure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(remeasure);
    };

    // First attempt synchronously; if absent, observe for a late mount.
    const initial = document.querySelector(selector);
    if (initial) {
      const rect = measure(initial);
      settled = true;
      setResult({ rect, isVisible: isNonEmpty(rect), resolved: true });
    }

    const observer = new MutationObserver(() => {
      if (!settled && document.querySelector(selector)) remeasure();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    timeout = window.setTimeout(() => {
      if (!settled) setResult({ rect: null, isVisible: false, resolved: true });
    }, TARGET_WAIT_MS);

    window.addEventListener('resize', scheduleRemeasure);
    window.addEventListener('scroll', scheduleRemeasure, true);
    window.addEventListener('orientationchange', scheduleRemeasure);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleRemeasure);
      window.removeEventListener('scroll', scheduleRemeasure, true);
      window.removeEventListener('orientationchange', scheduleRemeasure);
    };
  }, [anchor, active]);

  return result;
}
