import { useState, useRef, useEffect, useId } from 'react';
import {
  filterContainer,
  filterLabel,
  filterLabelFocused,
  filterIcon,
  filterClearButton,
  filterDropdown,
  filterOption,
  filterOptionActive,
  filterOptionHighlighted,
  filterOptionHighlightedActive,
} from './filter-styles';

export interface FilterSelectOption {
  label: string;
  value: string;
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  placeholder?: string;
}

export function FilterSelect({ label, value, onChange, options, placeholder }: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  /**
   * Index of the keyboard-active option. The menu is built from `<li>`, which
   * cannot hold focus, so navigation follows the WAI-ARIA listbox pattern:
   * focus stays on the trigger and this index is published to assistive tech
   * through `aria-activedescendant`.
   */
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex]!.label : undefined;
  const showFloatingLabel = focused || open || value !== '';

  const openMenu = () => {
    // Navigation starts from the current selection, so arrowing into an
    // already-answered filter does not silently jump back to the top.
    // `: 0` only when there is something at 0 — otherwise the trigger would
    // advertise an option id that does not exist.
    setActiveIndex(options.length === 0 ? -1 : selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
    setFocused(true);
  };

  const closeMenu = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const select = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    closeMenu();
    setFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      // Enter and Space already open the menu through the button's native
      // click, so they are deliberately not handled here.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (options.length === 0 ? -1 : Math.max(i - 1, 0)));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(options.length === 0 ? -1 : 0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        // Prevent the button's native click, which would otherwise re-toggle
        // the menu right after the selection closed it.
        e.preventDefault();
        select(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        // Consume it: Dialog closes on Escape from a document listener, so
        // letting this bubble would dismiss the whole modal along with the
        // menu and discard whatever the operator had filled in.
        e.stopPropagation();
        closeMenu();
        break;
      case 'Tab':
        // Let focus leave, but do not strand an open menu behind it.
        closeMenu();
        setFocused(false);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // A background refetch can shrink the list under an open menu, leaving the
  // index past the end — activedescendant would name a missing id and
  // Enter would preventDefault then no-op. Both combobox ports do this.
  useEffect(() => {
    setActiveIndex((i) => (i >= options.length ? -1 : i));
  }, [options.length]);

  // Keep the active option inside the scrolling menu as the user arrows past
  // its edges.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeIndex]);

  const optionClass = (index: number, isSelected: boolean) => {
    if (index === activeIndex) {
      return isSelected ? filterOptionHighlightedActive : filterOptionHighlighted;
    }
    return isSelected ? filterOptionActive : filterOption;
  };

  return (
    <div ref={containerRef} className={`${filterContainer} cursor-pointer`}>
      {showFloatingLabel && (
        <span className={focused || open ? filterLabelFocused : filterLabel}>{label}</span>
      )}
      <button
        ref={triggerRef}
        type="button"
        className={`flex w-full items-center justify-between px-3 py-[7px] text-sm ${
          // Room for the clear button, which overlays the trigger's right edge.
          value !== '' ? 'pr-9' : ''
        }`}
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          if (!open) setFocused(false);
        }}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
      >
        <span className={selectedLabel ? 'text-text-primary' : 'text-text-muted'}>
          {selectedLabel ?? (showFloatingLabel ? placeholder || '' : label)}
        </span>
        <i className={`mdi mdi-menu-down ${filterIcon} transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/*
        A sibling of the trigger, not a child: interactive content nested in a
        <button> is invalid HTML and cannot take focus, which is why the clear
        affordance used to be keyboard-unreachable. Overlaid on the trigger's
        right edge so the chevron stays inside the trigger and clickable.
      */}
      {value !== '' && (
        <button
          type="button"
          className={`absolute right-7 top-1/2 -translate-y-1/2 ${filterClearButton}`}
          onClick={() => {
            onChange('');
            closeMenu();
            // The button unmounts as the value clears; without this, focus
            // falls to <body> and the keyboard user loses their place.
            triggerRef.current?.focus();
          }}
          aria-label={`Clear ${label}`}
        >
          <i className="mdi mdi-close text-sm" />
        </button>
      )}

      {open && (
        <ul ref={listRef} id={listboxId} className={filterDropdown} role="listbox" aria-label={label}>
          {options.map((opt, index) => (
            <li
              key={opt.value}
              id={optionId(index)}
              role="option"
              aria-selected={opt.value === value}
              className={optionClass(index, opt.value === value)}
              onClick={() => select(index)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
