import { cn } from '@properfy/frontend-standards';

type ScheduleTab = 'upcoming' | 'history';

interface ScheduleTabsProps {
  value: ScheduleTab;
  onChange: (value: ScheduleTab) => void;
}

const TABS: Array<{ id: ScheduleTab; label: string }> = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'history', label: 'History' },
];

export function ScheduleTabs({ value, onChange }: ScheduleTabsProps) {
  return (
    <div className="mx-4 my-2 flex rounded-btn bg-muted p-1" role="tablist">
      {TABS.map((tab) => {
        const isActive = value === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex-1 rounded-btn py-1.5 text-sm font-semibold transition-colors',
              isActive
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
