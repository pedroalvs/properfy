import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';

interface RowAction {
  icon: string;
  label: string;
  onClick?: () => void;
  /** Internal route; renders a <Link> instead of a button so Cmd/Ctrl+click still opens a new tab. */
  to?: string;
  variant?: 'default' | 'delete';
  disabled?: boolean;
}

interface RowActionsProps {
  actions: RowAction[];
}

const actionClassName = (action: RowAction) =>
  `inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 ${
    action.disabled
      ? 'pointer-events-none opacity-40'
      : action.variant === 'delete'
        ? 'text-error hover:bg-error/10'
        : 'text-[rgba(0,0,0,0.54)] hover:bg-black/5'
  }`;

export function RowActions({ actions }: RowActionsProps) {
  return (
    <div className="flex items-center gap-1">
      {actions.map((action) => {
        const icon = <i className={`mdi ${action.icon} text-lg`} aria-hidden="true" />;
        const handleClick = (e: MouseEvent) => {
          e.stopPropagation();
          action.onClick?.();
        };
        return action.to ? (
          <Link
            key={action.label}
            to={action.to}
            onClick={handleClick}
            aria-label={action.label}
            className={actionClassName(action)}
          >
            {icon}
          </Link>
        ) : (
          <button
            key={action.label}
            onClick={handleClick}
            disabled={action.disabled}
            aria-label={action.label}
            className={actionClassName(action)}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}

export type { RowAction, RowActionsProps };
