import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outlined' | 'icon' | 'delete';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-real-estate text-white hover:brightness-95 active:brightness-90 h-9 px-4 rounded',
  secondary:
    'bg-[#F5F5F5] text-text-primary hover:bg-[#EEEEEE] active:bg-[#E0E0E0] h-9 px-4 rounded',
  outlined:
    'border border-primary text-primary bg-transparent hover:bg-primary/5 active:bg-primary/10 h-9 px-4 rounded',
  icon:
    'bg-transparent text-[rgba(0,0,0,0.54)] hover:bg-black/5 active:bg-black/10 h-9 w-9 rounded-full inline-flex items-center justify-center',
  delete:
    'bg-transparent text-error hover:bg-error/5 active:bg-error/10 h-9 w-9 rounded-full inline-flex items-center justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading = false, disabled, children, className = '', ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center gap-2 text-sm font-semibold transition-all duration-150 select-none
          ${variantClasses[variant]}
          ${isDisabled ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
          ${className}
        `}
        {...props}
      >
        {loading && (
          <i className="mdi mdi-loading mdi-spin text-base" aria-hidden="true" />
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
