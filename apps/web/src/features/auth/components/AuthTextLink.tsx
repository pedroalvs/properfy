import { Link, type LinkProps } from 'react-router-dom';
import type { ReactNode } from 'react';

/** Secondary navigation on the signed-out screens — "Back to Sign In", "Forgot your password?". */
export function AuthTextLink({ to, children }: { to: LinkProps['to']; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded text-sm font-bold text-primary transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {children}
    </Link>
  );
}
