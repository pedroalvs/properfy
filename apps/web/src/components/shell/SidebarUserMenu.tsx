import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface SidebarUserMenuProps {
  open?: boolean;
  onClose?: () => void;
  mobile?: boolean;
  onNavigate?: () => void;
}

export function SidebarUserMenu({
  open,
  onClose,
  mobile = false,
  onNavigate,
}: SidebarUserMenuProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);
  const isOpen = open ?? false;
  const handleClose = onClose ?? (() => {});

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, handleClose]);

  if (!isOpen && !mobile) return null;

  function handleNavigate(path: string) {
    navigate(path);
    handleClose();
    onNavigate?.();
  }

  if (mobile) {
    return (
      <div className="border-t border-border-subtle px-3 py-4">
        <div className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Settings
        </div>

        <div className="space-y-1">
          <button
            onClick={() => handleNavigate('/settings/account')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-black/5"
          >
            <i className="mdi mdi-account-edit-outline text-base opacity-65" />
            Edit Profile
          </button>

          <button
            onClick={() => handleNavigate('/settings/security')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-black/5"
          >
            <i className="mdi mdi-lock-reset text-base opacity-65" />
            Change Password
          </button>

          <button
            onClick={() => {
              logout();
              handleClose();
              onNavigate?.();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-black/5"
          >
            <i className="mdi mdi-logout text-base opacity-65" />
            Log out of system
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="absolute bottom-[70px] left-[65px] z-50 min-w-[200px] rounded-submenu border border-black/10 bg-white/65 py-2 text-left shadow-[rgba(0,0,0,0.2)_-2px_6px_12px_0] backdrop-blur-[10px]"
    >
      <button
        onClick={() => handleNavigate('/settings/account')}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-text-primary transition-colors hover:bg-black/5"
      >
        <i className="mdi mdi-account-edit-outline text-base opacity-65" />
        Edit Profile
      </button>

      <button
        onClick={() => handleNavigate('/settings/security')}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-text-primary transition-colors hover:bg-black/5"
      >
        <i className="mdi mdi-lock-reset text-base opacity-65" />
        Change Password
      </button>

      <div className="border-t border-black/5" />

      <button
        onClick={() => { logout(); handleClose(); onNavigate?.(); }}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-text-primary transition-colors hover:bg-black/5"
      >
        <i className="mdi mdi-logout text-base opacity-65" />
        Log out of system
      </button>
    </div>
  );
}
