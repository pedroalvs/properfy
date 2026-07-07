import { useState } from 'react';

interface SecretValueProps {
  value: string;
  /** When true the value starts masked behind a reveal toggle (for passwords). */
  maskable?: boolean;
  /** Accessible noun used in button labels, e.g. "password" or "username". */
  label?: string;
}

/**
 * Displays a credential value with a copy button, and — for passwords — a
 * reveal/hide toggle. App credentials are intentionally shown in plaintext
 * (the inspector needs them on site), so this is a convenience affordance,
 * not a security boundary.
 */
export function SecretValue({ value, maskable = false, label = 'value' }: SecretValueProps) {
  const [revealed, setRevealed] = useState(!maskable);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context); silently no-op.
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm" aria-label={label}>
        {revealed ? value : '••••••••'}
      </span>
      {maskable && (
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[rgba(0,0,0,0.54)] hover:bg-black/5"
        >
          <i className={`mdi ${revealed ? 'mdi-eye-off-outline' : 'mdi-eye-outline'} text-base`} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[rgba(0,0,0,0.54)] hover:bg-black/5"
      >
        <i className={`mdi ${copied ? 'mdi-check' : 'mdi-content-copy'} text-base`} aria-hidden="true" />
      </button>
    </span>
  );
}
