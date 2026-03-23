import type { MouseEvent } from 'react';

interface RowAction {
  icon: string;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'delete';
  disabled?: boolean;
}

interface RowActionsProps {
  actions: RowAction[];
}

export function RowActions({ actions }: RowActionsProps) {
  return (
    <div className="flex items-center gap-1">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            action.onClick();
          }}
          disabled={action.disabled}
          aria-label={action.label}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 ${
            action.disabled
              ? 'pointer-events-none opacity-40'
              : action.variant === 'delete'
                ? 'text-error hover:bg-error/10'
                : 'text-[rgba(0,0,0,0.54)] hover:bg-black/5'
          }`}
        >
          <i className={`mdi ${action.icon} text-lg`} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export type { RowAction, RowActionsProps };
