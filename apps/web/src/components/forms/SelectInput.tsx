import { useState, useRef, useEffect, useId } from 'react';
import {
  formInputContainer,
  formInputContainerError,
  formInputContainerDisabled,
  formSelectTrigger,
  formDropdown,
  formDropdownAbove,
  formOption,
  formOptionActive,
} from './form-styles';
import { clippingRect, resolveDropdownPlacement, type DropdownPlacement } from './dropdown-placement';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectInputProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  'aria-label'?: string;
}

export function SelectInput({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  error,
  id,
  'aria-label': ariaLabel,
}: SelectInputProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<DropdownPlacement>('below');
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  /**
   * Index of the keyboard-active option. The menu is built from `<li>`, which
   * cannot hold focus, so navigation follows the WAI-ARIA listbox pattern:
   * focus stays on the trigger and this index is published to assistive tech
   * through `aria-activedescendant`.
   */
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const listboxId = `${id ?? reactId}-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex]!.label : undefined;

  /**
   * Decide placement at open time, from the space left inside whatever
   * actually clips the menu. Measuring here (rather than on every render)
   * keeps the common case free and avoids a visible reposition.
   */
  const openMenu = () => {
    if (containerRef.current) {
      const trigger = containerRef.current.getBoundingClientRect();
      const clip = clippingRect(containerRef.current);
      const layout = resolveDropdownPlacement({
        triggerTop: trigger.top,
        triggerBottom: trigger.bottom,
        clipTop: clip.top,
        clipBottom: clip.bottom,
      });
      setPlacement(layout.placement);
      setMaxHeight(layout.maxHeight);
    }
    // Navigation starts from the current selection, so arrowing into an
    // already-answered field does not silently jump back to the top.
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const closeMenu = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const toggleOpen = () => {
    if (disabled) return;
    if (open) closeMenu();
    else openMenu();
  };

  const select = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    closeMenu();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

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
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
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
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keep the active option inside the scrolling menu as the user arrows past
  // its edges.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeIndex]);

  const containerClass = disabled
    ? formInputContainerDisabled
    : error
      ? formInputContainerError
      : formInputContainer;

  return (
    <div ref={containerRef} className={containerClass}>
      <button
        type="button"
        id={id}
        className={formSelectTrigger}
        onClick={toggleOpen}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
      >
        <span className={selectedLabel ? 'text-text-primary' : 'text-text-muted'}>
          {selectedLabel ?? placeholder ?? ''}
        </span>
        <i
          className={`mdi mdi-chevron-down text-text-muted text-lg transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          className={placement === 'above' ? formDropdownAbove : formDropdown}
          style={maxHeight !== undefined ? { maxHeight } : undefined}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((opt, index) => (
            <li
              key={opt.value}
              id={optionId(index)}
              role="option"
              aria-selected={opt.value === value}
              className={
                opt.value === value || index === activeIndex ? formOptionActive : formOption
              }
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
