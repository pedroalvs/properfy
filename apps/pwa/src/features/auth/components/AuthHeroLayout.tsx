import type { ReactNode } from 'react';
import { RouteArt } from './RouteArt';

interface AuthHeroLayoutProps {
  /** Rendered as the screen's `h1` on the white sheet. */
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/**
 * Shell shared by every signed-out PWA screen (login, forgot, reset): a teal hero band
 * carrying "The Round" and the brand lockup, with a white sheet beside it holding the
 * form.
 *
 * Mobile-first: the hero sits on top and the sheet rises over it with a rounded top edge.
 * At `lg` it becomes a split-pane — hero on the left, sheet on the right with a rounded
 * left edge — matching the web portal's signed-out layout and using the tablet's width in
 * landscape.
 *
 * `auth-reveal` arms the load sequence in styles/auth-pane.css; RouteArt's layer classes
 * are inert without it.
 */
export function AuthHeroLayout({ title, subtitle, children }: AuthHeroLayoutProps) {
  return (
    <div className="auth-reveal relative flex min-h-[100dvh] flex-col bg-background lg:flex-row">
      <div
        data-testid="auth-hero"
        className="auth-hero-gradient relative h-[42dvh] min-h-[248px] flex-shrink-0 overflow-hidden lg:h-auto lg:min-h-[100dvh] lg:w-[44%]"
      >
        <RouteArt className="absolute inset-0 h-full w-full" />

        {/* Brand lockup: top-left on mobile (brand leads), bottom-left caption at lg. */}
        <div className="auth-reveal-lockup absolute left-0 top-0 flex flex-col items-start px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] lg:bottom-12 lg:top-auto lg:px-10 lg:pt-0">
          <img src="/images/properfy-logo-red.png" alt="Properfy" className="h-9 w-auto sm:h-10" />
          <p className="mt-2 text-sm font-semibold text-white/75">Inspector Field App</p>
        </div>
      </div>

      <div className="relative z-10 -mt-7 flex flex-1 flex-col rounded-t-[26px] bg-card px-5 pt-7 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(21,86,118,0.12)] lg:-ml-7 lg:mt-0 lg:justify-center lg:rounded-l-[30px] lg:rounded-tr-none lg:px-14 lg:shadow-[-20px_0_54px_rgba(21,64,86,0.13)]">
        <div className="mx-auto w-full max-w-sm lg:mx-0">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm font-medium text-muted-foreground">{subtitle}</p>
          )}
          <div className="mt-4 h-[3px] w-[34px] rounded-sm bg-border" />

          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
