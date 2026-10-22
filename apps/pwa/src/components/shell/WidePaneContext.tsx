import { createContext, useContext } from 'react';

/**
 * Signals from a scroll-owning pane down to whatever header the page renders inside it.
 * `TwoPaneLayout` provides this (with `stickyHeader: true`) only when `fillHeight` is on, so each
 * pane owns its own scroll region; `TopBar` consumes it to pin itself to the pane top at `md`+.
 * Screens outside such a pane get the default and behave exactly as before.
 */
interface WidePaneState {
  /** The surrounding pane owns its scroll, so headers should pin to the pane top on tablet. */
  stickyHeader: boolean;
}

// Stable value objects so the provider never triggers consumer re-renders on re-render.
const STICKY_HEADER: WidePaneState = { stickyHeader: true };
const NO_STICKY_HEADER: WidePaneState = { stickyHeader: false };

const WidePaneContext = createContext<WidePaneState>(NO_STICKY_HEADER);

export const WidePaneProvider = WidePaneContext.Provider;
export { STICKY_HEADER, NO_STICKY_HEADER };

export function useWidePane(): WidePaneState {
  return useContext(WidePaneContext);
}
