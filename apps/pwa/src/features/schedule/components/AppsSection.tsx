import { useState } from 'react';
import { AppWindow, Check, Copy, ExternalLink, KeyRound } from 'lucide-react';
import { cn, TIMING } from '@properfy/frontend-standards';
import type { AppointmentApp } from '@properfy/shared';
import { Card } from '@/components/ui/Card';
import { buttonVariants } from '@/components/ui/Button';

interface AppsSectionProps {
  apps: AppointmentApp[] | undefined;
}

/** Tap-to-copy row for a single credential field (username / password). */
function CredentialRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), TIMING.flashMessage);
    } catch {
      // Clipboard unavailable (insecure context) — no-op.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="flex min-h-touch w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      aria-label={`Copy ${label}`}
      data-testid={testId}
    >
      <span className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <span className="font-mono text-sm text-foreground">{value}</span>
      </span>
      {copied ? (
        <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </button>
  );
}

/** External link action (open app / instructions), styled as the validated outlined button. */
function LinkRow({ label, url, testId }: { label: string; url: string; testId?: string }) {
  return (
    <div className="px-4 py-2.5">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants({ variant: 'outlined', block: true }))}
        data-testid={testId}
      >
        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
        {label}
      </a>
    </div>
  );
}

/**
 * Notice that the app prompts for a rotating authentication code. There is no
 * value to copy — rendered as static text, not a tap row, so it cannot read as
 * a dead touch target.
 */
function AuthCodeNotice() {
  return (
    <p
      className="flex min-h-touch items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground"
      data-testid="apps-section-auth-code-required"
    >
      <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" />
      Requires authentication code
    </p>
  );
}

function hasValue(value: string | null | undefined): value is string {
  return value != null && value.trim() !== '';
}

/**
 * App credentials the inspector needs on site (e.g. listing-platform logins).
 * Mirrors the contacts card styling. Values are shown in plaintext
 * (live reference) with tap-to-copy for fast on-site entry.
 */
export function AppsSection({ apps }: AppsSectionProps) {
  if (!apps || apps.length === 0) return null;

  return (
    <Card className="overflow-hidden p-0" data-testid="apps-section">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Apps</p>
      </div>
      <ul>
        {apps.map((app, idx) => (
          <li
            key={app.id}
            className={idx > 0 ? 'border-t border-border' : ''}
            data-testid="apps-section-item"
          >
            <div className="flex items-center gap-3 px-4 pt-3 pb-1">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-btn bg-muted text-muted-foreground">
                <AppWindow className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-foreground">{app.name}</p>
            </div>
            <div className="divide-y divide-border">
              <CredentialRow label="Username" value={app.username} testId="apps-section-username" />
              <CredentialRow label="Password" value={app.password} testId="apps-section-password" />
              {app.needsAuthCode && <AuthCodeNotice />}
              {hasValue(app.instructionsPassword) && (
                <CredentialRow
                  label="Instructions password"
                  value={app.instructionsPassword}
                  testId="apps-section-instructions-password"
                />
              )}
              {hasValue(app.appUrl) && (
                <LinkRow label="Open app" url={app.appUrl} testId="apps-section-open-app" />
              )}
              {hasValue(app.instructionsUrl) && (
                <LinkRow label="Instructions" url={app.instructionsUrl} testId="apps-section-instructions" />
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
