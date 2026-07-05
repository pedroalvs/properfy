import { useState } from 'react';
import type { AppointmentApp } from '@properfy/shared';

interface AppsSectionProps {
  apps: AppointmentApp[] | undefined;
}

/** Tap-to-copy row for a single credential field (username / password / auth code). */
function CredentialRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">{label}</span>
        <span className="font-mono text-sm text-text-primary">{value}</span>
      </span>
      <i className={`mdi ${copied ? 'mdi-check text-success' : 'mdi-content-copy text-text-muted'} text-base`} aria-hidden="true" />
    </button>
  );
}

/** External link action (open app / instructions), styled as a full-width tap row. */
function LinkRow({ label, url, testId }: { label: string; url: string; testId?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-touch w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
      data-testid={testId}
    >
      <span className="text-sm font-semibold text-primary">{label}</span>
      <i className="mdi mdi-open-in-new text-base text-primary" aria-hidden="true" />
    </a>
  );
}

function hasValue(value: string | null | undefined): value is string {
  return value != null && value.trim() !== '';
}

/**
 * App credentials the inspector needs on site (e.g. listing-platform logins).
 * Mirrors `TenantContactSection`'s card styling. Values are shown in plaintext
 * (live reference) with tap-to-copy for fast on-site entry.
 */
export function AppsSection({ apps }: AppsSectionProps) {
  if (!apps || apps.length === 0) return null;

  return (
    <section
      className="overflow-hidden rounded-[20px] border border-black/[0.06] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.07)]"
      data-testid="apps-section"
    >
      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Apps</p>
      </div>
      <ul>
        {apps.map((app, idx) => (
          <li
            key={app.id}
            className={idx > 0 ? 'border-t border-black/[0.06]' : ''}
            data-testid="apps-section-item"
          >
            <p className="px-4 pt-2 text-sm font-semibold text-text-primary">{app.name}</p>
            <div className="divide-y divide-black/[0.04]">
              <CredentialRow label="Username" value={app.username} testId="apps-section-username" />
              <CredentialRow label="Password" value={app.password} testId="apps-section-password" />
              {app.needsAuthCode && hasValue(app.authCode) && (
                <CredentialRow label="Auth code" value={app.authCode} testId="apps-section-auth-code" />
              )}
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
    </section>
  );
}
