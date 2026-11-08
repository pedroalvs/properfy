export interface SidebarItemBadgeProps {
  /** Number of unseen items; the badge renders nothing when `count <= 0`. */
  count: number;
  /** Accessible label; defaults to `"{count} unseen issues"`. */
  label?: string;
}

/**
 * Small amber dot overlaid on a sidebar icon to flag unseen items (F10 D15).
 * The count is conveyed to assistive tech via a visually-hidden label; the dot
 * itself is decorative. X01 ships no per-item badge, so this is the primitive.
 */
export function SidebarItemBadge({ count, label }: SidebarItemBadgeProps) {
  if (count <= 0) return null;
  const text = label ?? `${count} unseen issues`;
  return (
    <span
      data-testid="sidebar-item-badge"
      className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning ring-1 ring-card-bg"
    >
      <span className="sr-only">{text}</span>
    </span>
  );
}
