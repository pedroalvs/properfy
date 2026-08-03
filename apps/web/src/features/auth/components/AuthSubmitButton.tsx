import type { ReactNode } from 'react';

/**
 * Coral CTA for the signed-out screens. Kept apart from `components/ui/Button`,
 * whose primary variant is the 36px control the data screens use.
 */
export function AuthSubmitButton({
  loading = false,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex h-11 items-center justify-center gap-2 rounded bg-real-estate px-7 text-sm font-bold text-white transition hover:brightness-95 active:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-real-estate disabled:pointer-events-none disabled:opacity-50"
    >
      {loading && <i className="mdi mdi-loading mdi-spin text-base" aria-hidden="true" />}
      {children}
    </button>
  );
}
