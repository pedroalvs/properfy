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
  isIosSafariEligible: boolean;
  manualInstructions: string | null;
  promptInstall: () => Promise<boolean>;
}

const InstallPromptContext = createContext<InstallPromptContextValue | null>(null);

/** Returns true only for mobile Safari on iOS that has NOT been added to home screen. */
export function getIsIosSafariEligible(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isNativeSafari = /Safari\//.test(ua) && !/CriOS\//.test(ua) && !/FxiOS\//.test(ua) && !/EdgiOS\//.test(ua);
  const isStandalone =
    typeof (navigator as Navigator & { standalone?: boolean }).standalone === 'boolean'
      ? Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
      : window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  return isIos && isNativeSafari && !isStandalone;
}

function getManualInstructions(): string | null {
  if (typeof navigator === 'undefined') return null;
  const userAgent = navigator.userAgent;

  if (/Edg\//i.test(userAgent) || /Chrome\//i.test(userAgent)) {
    return 'Use the browser menu and choose "Install Properfy" if the install prompt does not appear automatically.';
  }

  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) {
    return 'This browser does not expose the install prompt directly. Use Safari Share menu > Add to Dock or open Properfy in Chrome or Edge.';
  }

  return 'If install is unavailable here, open Properfy in Chrome or Edge to install it as a desktop app.';
}

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
      isIosSafariEligible: getIsIosSafariEligible(),
      manualInstructions: !isInstalled ? getManualInstructions() : null,
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
