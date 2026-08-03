import { useState } from 'react';
import { AuthField, type AuthFieldProps } from './AuthField';

export type AuthPasswordFieldProps = Omit<AuthFieldProps, 'type' | 'trailing'>;

/**
 * Password field with a reveal toggle, as in the reference design.
 *
 * The toggle is a real button so it is reachable by keyboard, and it carries
 * `aria-pressed` because "show/hide" is a state, not a navigation. Its `type` is
 * explicit: inside a `<form>` the HTML default is "submit", which would post the
 * login form on every reveal.
 */
export function AuthPasswordField(props: AuthPasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <AuthField
      {...props}
      type={revealed ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
          aria-controls={props.id}
          disabled={props.disabled}
          className="flex h-9 w-9 items-center justify-center rounded text-text-muted transition-colors hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
        >
          <i
            className={`mdi text-lg ${revealed ? 'mdi-eye-off-outline' : 'mdi-eye-outline'}`}
            aria-hidden="true"
          />
        </button>
      }
    />
  );
}
