import type { ReactNode } from 'react';

interface ImportWizardProps {
  steps: string[];
  currentStep: number;
  children: ReactNode;
}

export function ImportWizard({ steps, currentStep, children }: ImportWizardProps) {
  return (
    <div className="space-y-8">
      {/* Step indicators */}
      <nav aria-label="Import progress" className="flex items-center justify-center gap-2">
        {steps.map((label, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;
          const isPending = index > currentStep;

          return (
            <div key={label} className="flex items-center gap-2">
              {index > 0 && (
                <div
                  className={`h-0.5 w-8 sm:w-12 ${
                    isCompleted ? 'bg-[var(--color-success)]' : 'bg-[var(--color-disabled-bg)]'
                  }`}
                  aria-hidden="true"
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  data-testid={`step-indicator-${index}`}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                    isCompleted
                      ? 'bg-[var(--color-success)] text-white'
                      : isActive
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-disabled-bg)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {isCompleted ? (
                    <i className="mdi mdi-check text-base" aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`text-xs font-semibold whitespace-nowrap ${
                    isActive
                      ? 'text-[var(--color-primary)]'
                      : isCompleted
                        ? 'text-[var(--color-success)]'
                        : isPending
                          ? 'text-[var(--color-text-muted)]'
                          : ''
                  }`}
                >
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Step content */}
      <div className="rounded-lg bg-[var(--color-card-bg)] p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
