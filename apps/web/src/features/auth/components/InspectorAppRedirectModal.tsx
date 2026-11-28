import { Dialog } from '@/components/ui/Dialog';
import { env } from '@/config/env';

interface InspectorAppRedirectModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Shown when an inspector (INSP) reaches a web sign-in. Inspectors use the
 * Properfy app, not this website, so this points them there. Closing it returns
 * to a clean login screen (the browser session is already discarded).
 */
export function InspectorAppRedirectModal({ open, onClose }: InspectorAppRedirectModalProps) {
  const appUrl = env.pwaUrl;
  const ctaClassName =
    'inline-flex h-11 items-center justify-center rounded bg-real-estate px-7 text-sm font-bold text-white transition hover:brightness-95 active:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Inspectors use the Properfy app"
      actions={
        // `env.pwaUrl` always resolves to a non-empty URL, but guard anyway so a
        // missing value renders a disabled button, never a broken empty-href link.
        appUrl ? (
          <a href={appUrl} className={ctaClassName}>
            Open the app
          </a>
        ) : (
          <button type="button" disabled className={ctaClassName}>
            Open the app
          </button>
        )
      }
    >
      <p className="text-sm leading-6 text-text-secondary">
        Your account doesn&apos;t have access to this website. Open the Properfy Inspector app to see
        your offers and schedule.
      </p>
    </Dialog>
  );
}
