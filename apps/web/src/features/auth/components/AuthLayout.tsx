import type { ReactNode } from 'react';
import { RouteArt } from './RouteArt';

const BRAND_TAGLINE = 'Inspection operations for Australian agencies.';

/**
 * Brand pane: the day's inspection round drawn as a map, with the lockup set against it.
 * Decorative in full — the form sheet next to it already names the product — so it is
 * hidden from assistive tech and dropped entirely below `lg`.
 *
 * The lockup sits bottom-left rather than centred so it reads as the map's caption and
 * leaves the upper two thirds — where the round actually runs — uncovered.
 *
 * `auth-pane-reveal` is what arms the load sequence in styles/auth-pane.css; the layer
 * classes inside RouteArt are inert without it.
 */
function AuthBrandPane({ logoHidden }: { logoHidden?: boolean }) {
  return (
    <div
      data-testid="auth-brand-pane"
      aria-hidden="true"
      className="auth-pane-reveal absolute inset-y-0 left-0 hidden w-[39.5%] overflow-hidden bg-[linear-gradient(155deg,var(--color-auth-pane-from),var(--color-auth-pane-to))] lg:block"
    >
      <RouteArt className="absolute inset-0 h-full w-full" />

      <div className="auth-reveal-lockup absolute bottom-0 left-0 flex flex-col items-start px-10 pb-12">
        {!logoHidden && (
          <>
            {/*
             * The asset is the full lockup on a generous transparent margin — roughly half
             * its height is padding — so it is set larger than its optical size to land at
             * about 24px of actual ink. Same reason PortalLayout sizes it the way it does.
             */}
            <img src="/images/properfy-logo-red.png" alt="" className="-ml-2 h-12 w-auto" />
          </>
        )}
        <p className="mt-1 max-w-[280px] text-balance font-poppins text-sm font-semibold leading-relaxed text-secondary/60">
          {BRAND_TAGLINE}
        </p>
      </div>
    </div>
  );
}

interface AuthLayoutProps {
  /** Rendered as the page's `h1` — or, with `logoAsTitle`, as the logo's accessible name. */
  title: string;
  subtitle: string;
  /**
   * Moves the brand to the sheet: the `h1` becomes the logo, sized to the space the
   * textual title would take, and the pane drops its logo (keeping only the tagline)
   * so the brand appears once. Login only — the other auth screens need their
   * textual titles.
   */
  logoAsTitle?: boolean;
  children: ReactNode;
}

/**
 * Shell shared by every signed-out screen: brand pane on the left, a white sheet on
 * the right whose left corners are rounded so the pane shows through behind them.
 *
 * Before this existed the same markup was pasted into LoginPage and
 * ForgotPasswordPage, and ResetPasswordPage carried a third, different variant.
 */
export function AuthLayout({ title, subtitle, logoAsTitle = false, children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen bg-app-bg">
      <AuthBrandPane logoHidden={logoAsTitle} />

      <div className="relative flex min-h-screen flex-col justify-center bg-card-bg px-6 py-12 sm:px-10 lg:ml-[39.5%] lg:rounded-l-[30px] lg:px-0 lg:shadow-[-20px_0_54px_rgba(21,64,86,0.13)]">
        <div className="mx-auto w-full max-w-[420px] lg:mx-0 lg:ml-[22%] lg:w-[57%] lg:max-w-none">
          {/* Below lg the pane is gone, so the sheet carries the brand itself — unless
              the heading already is the logo. */}
          {!logoAsTitle && (
            <img
              src="/images/properfy-logo-red.png"
              alt="Properfy"
              className="-ml-2 mb-8 h-10 w-auto lg:hidden"
            />
          )}

          <h1 className="font-poppins text-[30px] font-bold leading-tight tracking-tight text-secondary sm:text-[34px]">
            {logoAsTitle ? (
              /* ~50% of the asset's height is transparent padding, so `h-16`/`h-[72px]`
                 lands at roughly the ink height of the textual title, and the negative
                 margins swallow the padding so the subtitle spacing doesn't grow. */
              <img
                src="/images/properfy-logo-red.png"
                alt={title}
                className="-my-3 -ml-3 h-16 w-auto sm:h-[72px] sm:-my-3.5"
              />
            ) : (
              title
            )}
          </h1>
          <p className="mt-1 font-poppins text-lg font-semibold text-text-muted sm:text-xl">
            {subtitle}
          </p>
          <div className="mt-5 h-[3px] w-[34px] rounded-sm bg-border-subtle" />

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
