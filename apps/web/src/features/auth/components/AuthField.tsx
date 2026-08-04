import type { InputHTMLAttributes, ReactNode } from 'react';

export interface AuthFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Control rendered inside the field's right edge, e.g. a reveal toggle. */
  trailing?: ReactNode;
}

/**
 * Outlined text field with the label notched into the top border.
 *
 * Deliberately not built on `components/forms/FormField` + `TextInput`: those render
 * the 4px, 36px-tall control the data screens use, driven by a shadow-based border.
 * The signed-out screens are a different surface — taller controls, a notched label,
 * no surrounding card — and bending the shared primitive to cover both would leave
 * every consumer paying for a variant only three pages want.
 */
export function AuthField({ id, label, error, hint, trailing, ...inputProps }: AuthFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div>
      {/* `group` and not `peer`: the label precedes the input, and peer variants only
          look forward. focus-within on the wrapper reads in either direction. */}
      <div className="group relative">
        <label
          htmlFor={id}
          className="absolute -top-2 left-3 z-10 bg-card-bg px-1.5 text-xs font-bold text-text-muted transition-colors group-focus-within:text-primary"
        >
          {label}
        </label>
        <input
          {...inputProps}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-[52px] w-full rounded border border-black/20 bg-card-bg text-[15px] text-text-primary outline-none transition-colors placeholder:text-text-disabled focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 aria-[invalid=true]:border-error ${
            trailing ? 'pl-4 pr-12' : 'px-4'
          }`}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>
        )}
      </div>

      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-error">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={hintId} className="mt-1.5 text-xs leading-5 text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
