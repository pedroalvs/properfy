import { useState, type ReactNode } from 'react';

interface MapFiltersPanelProps {
  title?: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
}

export function MapFiltersPanel({
  title = 'Filters',
  children,
  defaultCollapsed = false,
}: MapFiltersPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="border-b border-gray-200 bg-card-bg" data-testid="map-filters-panel">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-secondary hover:bg-gray-50"
        aria-expanded={!collapsed}
        aria-controls="map-filters-content"
      >
        <span className="flex items-center gap-2">
          <i className="mdi mdi-filter-outline" aria-hidden="true" />
          {title}
        </span>
        <i
          className={`mdi ${collapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'} text-text-muted`}
          aria-hidden="true"
        />
      </button>
      <div
        id="map-filters-content"
        className={`overflow-hidden transition-all duration-200 ${
          collapsed ? 'max-h-0' : 'max-h-96'
        }`}
      >
        <div className="px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}
