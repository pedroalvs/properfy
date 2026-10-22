import { Segmented } from '@/components/ui/Segmented';

type ScheduleTab = 'upcoming' | 'history';

interface ScheduleTabsProps {
  value: ScheduleTab;
  onChange: (value: ScheduleTab) => void;
}

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'history', label: 'History' },
] as const satisfies ReadonlyArray<{ id: ScheduleTab; label: string }>;

export function ScheduleTabs({ value, onChange }: ScheduleTabsProps) {
  return (
    <Segmented
      value={value}
      options={TABS}
      onChange={onChange}
      className="mx-4 my-2"
      aria-label="Schedule view"
    />
  );
}
