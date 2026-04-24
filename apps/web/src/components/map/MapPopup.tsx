import type { CSSProperties, ReactNode } from 'react';

interface MapPopupProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: { label: string; onClick: () => void }[];
  style?: CSSProperties;
}

export function MapPopup({ title, children, onClose, actions, style }: MapPopupProps) {
  return (
    <div
      className="absolute z-20 w-72 rounded-lg bg-card-bg shadow-xl"
      style={style}
      data-testid="map-popup"
      role="dialog"
      aria-label={title}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-bold text-secondary">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-full text-text-muted hover:bg-gray-100"
          aria-label="Close popup"
        >
          <i className="mdi mdi-close text-base" aria-hidden="true" />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-3 text-sm text-text-primary">{children}</div>

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="flex gap-2 border-t border-gray-100 px-4 py-3">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="rounded px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
