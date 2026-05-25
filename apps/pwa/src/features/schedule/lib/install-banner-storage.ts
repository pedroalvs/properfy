const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const NATIVE_KEY = 'properfy.installBanner.native.dismissedAt';
const IOS_KEY = 'properfy.installBanner.ios.dismissedAt';

function isDismissed(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const ts = Number(raw);
    return !isNaN(ts) && Date.now() - ts < THIRTY_DAYS_MS;
  } catch {
    return false;
  }
}

function dismiss(key: string): void {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // localStorage unavailable — banner will show again next session
  }
}

export function isNativeBannerDismissed(): boolean {
  return isDismissed(NATIVE_KEY);
}

export function dismissNativeBanner(): void {
  dismiss(NATIVE_KEY);
}

export function isIosBannerDismissed(): boolean {
  return isDismissed(IOS_KEY);
}

export function dismissIosBanner(): void {
  dismiss(IOS_KEY);
}
