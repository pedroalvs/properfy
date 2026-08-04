import type { ReactNode } from 'react';

/** Recoverable-error banner shared by the signed-out screens. */
export function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mb-6 rounded border border-error/20 bg-error/5 px-4 py-3 text-sm leading-6 text-error"
    >
      {children}
    </div>
  );
}
