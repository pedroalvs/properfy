import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from '@/hooks/useLocale';
import { SUPPORTED_LOCALES, type Locale } from '@/lib/i18n';

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
  const { locale, setLocale, t } = useLocale();
  const [showLanguages, setShowLanguages] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOpen = open ?? false;
  const handleClose = onClose ?? (() => {});

  useEffect(() => {
    if (!isOpen) {
      setShowLanguages(false);
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

  function handleSelectLocale(next: Locale) {
    setLocale(next);
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
            {t('menu.editProfile')}
          </button>

          <button
            onClick={() => handleNavigate('/settings/security')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-black/5"
          >
            <i className="mdi mdi-lock-reset text-base opacity-65" />
            {t('menu.changePassword')}
          </button>

          <div className="rounded-lg border border-border-subtle">
            <button
              onClick={() => setShowLanguages((v) => !v)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-black/5"
            >
              <i className="mdi mdi-web text-base opacity-65" />
              <span className="flex-1">{t('menu.changeLanguage')}</span>
              <i className={`mdi text-xs opacity-40 transition-transform ${showLanguages ? 'mdi-chevron-up' : 'mdi-chevron-down'}`} />
            </button>

            {showLanguages && (
              <div className="border-t border-border-subtle px-2 py-2">
                {SUPPORTED_LOCALES.map((loc) => (
                  <button
                    key={loc.value}
                    onClick={() => handleSelectLocale(loc.value)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-black/5"
                  >
                    <span className="text-base">{loc.flag}</span>
                    <span className={locale === loc.value ? 'font-semibold text-realty' : 'text-text-muted'}>
                      {loc.label}
                    </span>
                    {locale === loc.value && (
                      <i className="mdi mdi-check ml-auto text-sm text-realty" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              logout();
              handleClose();
              onNavigate?.();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-black/5"
          >
            <i className="mdi mdi-logout text-base opacity-65" />
            {t('menu.logout')}
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
        {t('menu.editProfile')}
      </button>

      <button
        onClick={() => handleNavigate('/settings/security')}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-text-primary transition-colors hover:bg-black/5"
      >
        <i className="mdi mdi-lock-reset text-base opacity-65" />
        {t('menu.changePassword')}
      </button>

      <button
        onClick={() => setShowLanguages((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-text-primary transition-colors hover:bg-black/5"
      >
        <i className="mdi mdi-web text-base opacity-65" />
        <span className="flex-1">{t('menu.changeLanguage')}</span>
        <i className={`mdi text-xs opacity-40 transition-transform ${showLanguages ? 'mdi-chevron-up' : 'mdi-chevron-down'}`} />
      </button>

      {showLanguages && (
        <div className="border-t border-black/5 pb-1">
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc.value}
              onClick={() => handleSelectLocale(loc.value)}
              className="flex w-full items-center gap-3 px-6 py-2 text-sm transition-colors hover:bg-black/5"
            >
              <span className="text-base">{loc.flag}</span>
              <span className={locale === loc.value ? 'font-semibold text-realty' : 'text-text-muted'}>
                {loc.label}
              </span>
              {locale === loc.value && (
                <i className="mdi mdi-check ml-auto text-sm text-realty" />
              )}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-black/5" />

      <button
        onClick={() => { logout(); handleClose(); onNavigate?.(); }}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-text-primary transition-colors hover:bg-black/5"
      >
        <i className="mdi mdi-logout text-base opacity-65" />
        {t('menu.logout')}
      </button>
    </div>
  );
}
