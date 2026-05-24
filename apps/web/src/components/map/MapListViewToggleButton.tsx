import { useNavigate } from 'react-router-dom';

/**
 * 026 C10 — Pill-style navigation button that takes the operator from the
 * map view back to the full appointment list. Mirrors the MapFilterToggleButton
 * aesthetics so both controls feel like they belong to the same family.
 *
 * No active/pressed state — this is a navigation action, not a stateful toggle.
 */
export function MapListViewToggleButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/appointments/list')}
      className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-card-bg px-4 py-2 text-sm font-medium text-text-secondary shadow-md transition-colors hover:bg-gray-50"
      aria-label="Switch to list view"
      data-testid="map-list-view-toggle"
    >
      <i className="mdi mdi-format-list-bulleted text-base" aria-hidden="true" />
      <span>List view</span>
    </button>
  );
}
