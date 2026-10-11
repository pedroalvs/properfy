import { Segmented } from '@/components/ui/Segmented';

interface OffersViewToggleProps {
  value: 'list' | 'map';
  onChange: (value: 'list' | 'map') => void;
}

const VIEW_OPTIONS = [
  { id: 'list', label: 'List' },
  { id: 'map', label: 'Map' },
] as const;

export function OffersViewToggle({ value, onChange }: OffersViewToggleProps) {
  return (
    <Segmented
      value={value}
      options={VIEW_OPTIONS}
      onChange={onChange}
      className="mx-4 my-2"
      aria-label="Offers view"
    />
  );
}
