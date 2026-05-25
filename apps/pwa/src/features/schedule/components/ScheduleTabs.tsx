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
    <div className="flex rounded-xl bg-gray-100 p-1 mx-4 my-2" role="tablist">
      {TABS.map((tab) => {
        const isActive = value === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-white text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
