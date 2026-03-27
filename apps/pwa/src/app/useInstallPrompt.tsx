import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function getIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mediaMatch = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = typeof navigator !== 'undefined' && 'standalone' in navigator
    ? Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    : false;
  return mediaMatch || iosStandalone;
}

interface InstallPromptContextValue {
  isInstalled: boolean;
  canInstall: boolean;
  promptInstall: () => Promise<boolean>;
}

const InstallPromptContext = createContext<InstallPromptContextValue | null>(null);

export function InstallPromptProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(getIsStandalone);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
    const updateInstalled = () => setIsInstalled(getIsStandalone());
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    updateInstalled();
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    mediaQuery?.addEventListener?.('change', updateInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      mediaQuery?.removeEventListener?.('change', updateInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice?.catch(() => undefined);
    setDeferredPrompt(null);
    setIsInstalled(getIsStandalone() || choice?.outcome === 'accepted');
    return choice?.outcome === 'accepted';
  }, [deferredPrompt]);

  const value = useMemo<InstallPromptContextValue>(
    () => ({
      isInstalled,
      canInstall: !!deferredPrompt && !isInstalled,
      promptInstall,
    }),
    [deferredPrompt, isInstalled, promptInstall],
  );

  return <InstallPromptContext.Provider value={value}>{children}</InstallPromptContext.Provider>;
}

export function useInstallPrompt() {
  const context = useContext(InstallPromptContext);
  if (!context) {
    throw new Error('useInstallPrompt must be used within InstallPromptProvider');
  }
  return context;
}
