interface MapLassoToggleButtonProps {
  active: boolean;
  onClick: () => void;
}

export function MapLassoToggleButton({ active, onClick }: MapLassoToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-md transition-colors ${
        active
          ? 'border-primary bg-primary text-white'
          : 'border-border-subtle bg-card-bg text-text-secondary hover:bg-gray-50'
      }`}
      aria-label="Select area"
      aria-pressed={active}
      data-testid="map-lasso-toggle"
    >
      <i className="mdi mdi-selection-drag text-base" aria-hidden="true" />
      <span>Select area</span>
    </button>
  );
}
