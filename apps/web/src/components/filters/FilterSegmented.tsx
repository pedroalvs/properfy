import { useRef } from 'react';

interface FilterSegmentedProps {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}

/**
 * Pill-style segmented control for filter panels (replaces FilterSelect for mode switching).
 *
 * Follows the WAI-ARIA tabs pattern: the tablist is a **single** tab stop
 * (roving tabindex — only the selected tab is reachable with Tab), and the
 * arrow keys move between tabs, wrapping at both ends. Selection follows focus,
 * which is the automatic-activation variant and the right fit here because
 * switching costs nothing more than a re-filter.
 */
export function FilterSegmented({ label, value, options, onChange }: FilterSegmentedProps) {
  const listRef = useRef<HTMLDivElement>(null);

  /** Moves selection and carries focus with it, as the tabs pattern requires. */
  const moveTo = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        // Wraps: a tablist is a loop, unlike the listbox which stops at its ends.
        moveTo((index + 1) % options.length);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        moveTo((index - 1 + options.length) % options.length);
        break;
      case 'Home':
        e.preventDefault();
        moveTo(0);
        break;
      case 'End':
        e.preventDefault();
        moveTo(options.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-text-secondary">{label}</span>
      <div ref={listRef} className="flex gap-1" role="tablist" aria-label={label}>
        {options.map((opt, index) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
