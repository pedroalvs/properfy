interface MapFilterToggleButtonProps {
  open: boolean;
  onToggle: () => void;
  /** Optional badge count for active-filter indicator (future-proofing). */
  activeFilterCount?: number;
}

/**
 * 026 §FR-570 — Pill-style toggle for the filter overlay. Renders at
 * top-left of the map area; the page positions it absolutely. While the
 * panel is open the button is visually pressed (slightly darker) so the
 * operator can confirm at a glance.
 *
 * Click toggles the page-level `filtersOpen` state which the page also
 * persists to sessionStorage (so the panel state survives reload).
 */
export function MapFilterToggleButton({
  open,
  onToggle,
  activeFilterCount = 0,
}: MapFilterToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-2 rounded-full border border-border-subtle bg-card-bg px-4 py-2 text-sm font-medium shadow-md transition-colors hover:bg-gray-50 ${
        open ? 'bg-gray-100 text-text-primary' : 'text-text-secondary'
      }`}
      aria-pressed={open}
      aria-label={open ? 'Hide filters' : 'Show filters'}
      data-testid="map-filter-toggle"
    >
      <i className="mdi mdi-filter-variant text-base" aria-hidden="true" />
      <span>Filters</span>
      {activeFilterCount > 0 && (
        <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-semibold text-white">
          {activeFilterCount}
        </span>
      )}
    </button>
  );
}
