import { useNavigate } from 'react-router-dom';

interface MapListViewToggleButtonProps {
  mode?: 'appointments' | 'groups';
}

export function MapListViewToggleButton({ mode = 'appointments' }: MapListViewToggleButtonProps) {
  const navigate = useNavigate();
  const path = mode === 'groups' ? '/service-groups' : '/appointments';
  return (
    <button
      type="button"
      onClick={() => navigate(path)}
      className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-card-bg px-4 py-2 text-sm font-medium text-text-secondary shadow-md transition-colors hover:bg-gray-50"
      aria-label="Switch to list view"
      data-testid="map-list-view-toggle"
    >
      <i className="mdi mdi-format-list-bulleted text-base" aria-hidden="true" />
      <span>List view</span>
    </button>
  );
}
