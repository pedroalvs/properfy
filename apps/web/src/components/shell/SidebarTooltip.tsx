import { createPortal } from 'react-dom';

interface SidebarTooltipProps {
  label: string;
  /** Anchor element the tooltip is positioned next to (rendered to its right). */
  anchor: HTMLElement | null;
  visible: boolean;
}

/**
 * Tooltip shown to the right of a desktop sidebar icon. Rendered through a
 * portal because the sidebar nav has overflow-y-auto, which clips absolutely
 * positioned children (same reason SidebarSubmenu portals its flyout).
 */
export function SidebarTooltip({ label, anchor, visible }: SidebarTooltipProps) {
  if (!visible || !anchor) return null;

  const rect = anchor.getBoundingClientRect();

  return createPortal(
    <span
      role="tooltip"
      style={{ position: 'fixed', top: rect.top + rect.height / 2, left: rect.right + 8 }}
      className="pointer-events-none z-[70] -translate-y-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white"
    >
      {label}
      <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
    </span>,
    document.body,
  );
}
