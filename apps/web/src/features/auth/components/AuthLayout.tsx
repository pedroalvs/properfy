import type { ReactNode } from 'react';
import { SkylineArt } from './SkylineArt';

const BRAND_TAGLINE = 'Inspection operations for Australian agencies.';

/**
 * Brand pane: stacked lockup over a line-art skyline, on a cool tint of the brand
 * navy. Decorative in full — the form sheet next to it already names the product —
 * so it is hidden from assistive tech and dropped entirely below `lg`.
 *
 * The skyline overflows the pane by 10% on each side; see SkylineArt for why.
 */
function AuthBrandPane() {
  return (
    <div
      data-testid="auth-brand-pane"
      aria-hidden="true"
      className="absolute inset-y-0 left-0 hidden w-[39.5%] overflow-hidden bg-[linear-gradient(155deg,var(--color-auth-pane-from),var(--color-auth-pane-to))] lg:block"
    >
      <div className="absolute left-0 top-[37%] flex w-full -translate-y-1/2 flex-col items-center px-8">
        <img src="/images/properfy-icon.png" alt="" className="w-[14%] min-w-[62px]" />
        <img src="/images/properfy-wordmark.png" alt="" className="mt-4 w-[33%] min-w-[150px]" />
        <p className="mt-2 max-w-[78%] text-balance text-center font-poppins text-sm font-semibold leading-relaxed text-secondary/60">
          {BRAND_TAGLINE}
        </p>
      </div>

      <SkylineArt className="absolute bottom-0 left-[-10%] w-[120%] text-secondary" />
    </div>
  );
}

interface AuthLayoutProps {
  /** Rendered as the page's `h1`. */
  title: string;
  subtitle: string;
  children: ReactNode;
}

/**
 * Shell shared by every signed-out screen: brand pane on the left, a white sheet on
 * the right whose left corners are rounded so the pane shows through behind them.
 *
 * Before this existed the same markup was pasted into LoginPage and
 * ForgotPasswordPage, and ResetPasswordPage carried a third, different variant.
 */
export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen bg-app-bg">
      <AuthBrandPane />

      <div className="relative flex min-h-screen flex-col justify-center bg-card-bg px-6 py-12 sm:px-10 lg:ml-[39.5%] lg:rounded-l-[30px] lg:px-0 lg:shadow-[-20px_0_54px_rgba(21,64,86,0.13)]">
        <div className="mx-auto w-full max-w-[420px] lg:mx-0 lg:ml-[22%] lg:w-[57%] lg:max-w-none">
          {/* Below lg the pane is gone, so the sheet carries the brand itself. */}
          <img
            src="/images/properfy-wordmark.png"
            alt="Properfy"
            className="mb-10 h-6 w-auto lg:hidden"
          />

          <h1 className="font-poppins text-[30px] font-bold leading-tight tracking-tight text-secondary sm:text-[34px]">
            {title}
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
