interface OffersViewToggleProps {
  value: 'list' | 'map';
  onChange: (value: 'list' | 'map') => void;
}

export function OffersViewToggle({ value, onChange }: OffersViewToggleProps) {
  return (
    <div className="flex rounded-xl bg-gray-100 p-1 mx-4 my-2" role="tablist">
      {(['list', 'map'] as const).map((option) => (
        <button
          key={option}
          role="tab"
          data-active={String(value === option)}
          onClick={() => onChange(option)}
          className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-all ${
            value === option
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {option.charAt(0).toUpperCase() + option.slice(1)}
        </button>
      ))}
    </div>
  );
}
