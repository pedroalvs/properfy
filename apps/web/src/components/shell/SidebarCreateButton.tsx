import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@properfy/frontend-standards';

import { SidebarTooltip } from './SidebarTooltip';

interface SidebarCreateButtonProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

const LABEL = 'New Appointment';
// Canonical create entry point: the router redirects /appointments/new to
// /appointments?new=1, which opens the create drawer (the single form). Going
// through the route keeps the `?new=1` param contract owned in one place.
const TARGET = '/appointments/new';

/**
 * Coral "ghost" CTA at the top of the sidebar rail (design D). It is an action,
 * not a navigation destination, so it is a <button> that navigates on click and
 * never shows an active state. Gated by `appointment.create` at the call site.
 */
export function SidebarCreateButton({ mobile = false, onNavigate }: SidebarCreateButtonProps) {
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = () => {
    navigate(TARGET);
    onNavigate?.();
  };

  if (mobile) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={LABEL}
        className="flex w-full items-center gap-3 rounded-lg bg-real-estate px-4 py-3 text-sm font-semibold text-white transition-[filter] hover:brightness-95 active:brightness-90"
      >
        <i className="mdi mdi-plus text-xl" aria-hidden="true" />
        <span className="truncate">{LABEL}</span>
      </button>
    );
  }

  return (
    <div className="w-sidebar px-1 py-2 text-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={() => setIsHovered(false)}
        aria-label={LABEL}
        className={cn(
          'inline-flex h-11 w-11 items-center justify-center rounded-full',
          'bg-real-estate/12 text-real-estate ring-1 ring-inset ring-real-estate/40',
          'transition-colors hover:bg-real-estate/20 hover:ring-real-estate',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-real-estate',
        )}
      >
        <i className="mdi mdi-plus text-2xl" aria-hidden="true" />
      </button>
      <SidebarTooltip label={LABEL} anchor={buttonRef.current} visible={isHovered} />
    </div>
  );
}
