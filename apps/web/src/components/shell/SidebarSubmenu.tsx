import { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';

interface SubmenuItem {
  icon: string;
  label: string;
  to: string;
}

interface SidebarSubmenuProps {
  icon: string;
  label: string;
  items: SubmenuItem[];
  mobile?: boolean;
  onNavigate?: () => void;
}

export function SidebarSubmenu({
  icon,
  label,
  items,
  mobile = false,
  onNavigate,
}: SidebarSubmenuProps) {
  const location = useLocation();
  const isActive = items.some((item) => location.pathname.startsWith(item.to));

  // Desktop-only hover state
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    window.addEventListener('scroll', close, { capture: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, [isOpen]);

  const openSubmenu = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (containerRef.current) {
      setAnchorRect(containerRef.current.getBoundingClientRect());
      setIsOpen(true);
    }
  }, []);

  const scheduleClose = useCallback(() => {
    closeTimerRef.current = setTimeout(() => setIsOpen(false), 150);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  if (mobile) {
    return (
      <div className="rounded-lg border border-border-subtle bg-white/60" aria-label={label}>
        <div
          className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold ${
            isActive ? 'text-real-estate' : 'text-text-primary'
          }`}
        >
          <i className={`mdi ${icon} text-xl`} />
          <span>{label}</span>
        </div>
        <div className="border-t border-border-subtle px-2 py-2">
          {items.map((item) => {
            const linkActive = location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => onNavigate?.()}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  linkActive
                    ? 'bg-real-estate/10 font-medium text-real-estate'
                    : 'text-text-primary hover:bg-black/5'
                }`}
              >
                <i className={`mdi ${item.icon} text-lg`} />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-sidebar px-1 py-2 text-center"
      onMouseEnter={openSubmenu}
      onMouseLeave={scheduleClose}
    >
      <span
        className={`absolute left-0 top-[-4px] h-[calc(100%+8px)] w-1 rounded-r transition-colors ${
          isActive ? 'bg-realty' : 'bg-transparent'
        }`}
      />
      <span className="pointer-events-none absolute right-[15px] top-1/2 -translate-y-1/2 border-l-[5px] border-y-[5px] border-y-transparent border-l-black/20" />
      <button
        ref={triggerRef}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="block w-full focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setIsOpen(false);
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSubmenu();
          }
        }}
      >
        <i
          className={`mdi ${icon} text-2xl transition-opacity ${
            isActive || isOpen ? 'text-realty opacity-100' : 'opacity-65 hover:opacity-100 hover:text-realty'
          }`}
        />
      </button>

      {isOpen && anchorRect &&
        createPortal(
          <div
            role="menu"
            style={{ position: 'fixed', top: anchorRect.top, left: anchorRect.right }}
            className="z-[60] min-w-[180px] rounded-submenu border border-black/10 bg-white/65 px-5 py-5 text-left shadow-[rgba(0,0,0,0.2)_-2px_6px_12px_0] backdrop-blur-[10px]"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsOpen(false);
                triggerRef.current?.focus();
              }
            }}
          >
            <div className="mb-2 text-sm font-semibold text-text-primary">{label}</div>
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                role="menuitem"
                className={({ isActive: linkActive }) =>
                  `relative block py-2.5 text-sm no-underline transition-colors ${
                    linkActive ? 'font-semibold text-realty' : 'text-text-muted hover:text-realty'
                  }`
                }
              >
                {({ isActive: linkActive }) => (
                  <>
                    {linkActive && (
                      <span className="absolute -left-5 top-[5px] h-[30px] w-1 rounded-r bg-realty" />
                    )}
                    <i className={`mdi ${item.icon} mr-2 text-base`} />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
