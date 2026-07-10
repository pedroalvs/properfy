import { useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { SidebarTooltip } from './SidebarTooltip';

interface SidebarItemProps {
  icon: string;
  label: string;
  to: string;
  mobile?: boolean;
  onNavigate?: () => void;
}

export function SidebarItem({ icon, label, to, mobile = false, onNavigate }: SidebarItemProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <NavLink
      ref={linkRef}
      to={to}
      onClick={() => onNavigate?.()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      className={({ isActive }) =>
        mobile
          ? `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-real-estate/10 text-real-estate'
                : 'text-text-primary hover:bg-black/5'
            }`
          : `group relative block w-sidebar px-1 py-2 text-center ${
              isActive ? 'sidebar-active' : ''
            }`
      }
      aria-label={label}
    >
      {({ isActive }) => (
        <>
          {!mobile && (
            <span
              className={`absolute left-0 top-[-4px] h-[calc(100%+8px)] w-1 rounded-r transition-colors ${
                isActive ? 'bg-realty' : 'bg-transparent'
              }`}
            />
          )}
          <i
            className={`mdi ${icon} transition-opacity ${
              mobile
                ? `text-xl ${isActive ? 'text-real-estate' : 'text-text-secondary'}`
                : `text-2xl ${
                    isActive
                      ? 'text-realty opacity-100'
                      : 'opacity-65 group-hover:text-realty group-hover:opacity-100'
                  }`
            }`}
          />
          {mobile ? (
            <span className="truncate">{label}</span>
          ) : (
            <SidebarTooltip label={label} anchor={linkRef.current} visible={isHovered} />
          )}
        </>
      )}
    </NavLink>
  );
}
