interface PageSectionHeaderProps {
  title: string;
  count?: number;
  action?: { label: string; onClick: () => void };
}

export function PageSectionHeader({ title, count, action }: PageSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <h2 className="text-base font-semibold text-text-primary">
        {title}
        {count !== undefined && (
          <span className="ml-1 text-text-secondary">({count})</span>
        )}
      </h2>
      {action && (
        <button
          onClick={action.onClick}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
