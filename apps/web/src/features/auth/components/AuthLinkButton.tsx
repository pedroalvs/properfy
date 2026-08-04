import { Link, type LinkProps } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * Coral CTA rendered as a link. Used where the screen has nothing left to submit —
 * the success and dead-end states — so it must not be a `<button type="submit">`.
 * Visually the twin of AuthSubmitButton.
 */
export function AuthLinkButton({ to, children }: { to: LinkProps['to']; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex h-11 items-center justify-center rounded bg-real-estate px-7 text-sm font-bold text-white transition hover:brightness-95 active:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {children}
    </Link>
  );
}
