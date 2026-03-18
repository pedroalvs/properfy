import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImportWizard } from './ImportWizard';

const STEPS = ['Upload', 'Preview', 'Confirm', 'Progress'];

describe('ImportWizard', () => {
  it('renders all step indicators', () => {
    render(
      <ImportWizard steps={STEPS} currentStep={0}>
        <div>Step content</div>
      </ImportWizard>,
    );

    for (const step of STEPS) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });

  it('highlights current step', () => {
    render(
      <ImportWizard steps={STEPS} currentStep={1}>
        <div>Step content</div>
      </ImportWizard>,
    );

    const activeIndicator = screen.getByTestId('step-indicator-1');
    expect(activeIndicator).toHaveTextContent('2');
    expect(activeIndicator.className).toContain('bg-[var(--color-primary)]');
  });

  it('shows completed state for past steps', () => {
    render(
      <ImportWizard steps={STEPS} currentStep={2}>
        <div>Step content</div>
      </ImportWizard>,
    );

    const completedIndicator = screen.getByTestId('step-indicator-0');
    expect(completedIndicator.className).toContain('bg-[var(--color-success)]');
    expect(completedIndicator.querySelector('.mdi-check')).toBeInTheDocument();

    const completedIndicator2 = screen.getByTestId('step-indicator-1');
    expect(completedIndicator2.className).toContain('bg-[var(--color-success)]');
  });

  it('renders children content', () => {
    render(
      <ImportWizard steps={STEPS} currentStep={0}>
        <div>Upload your file here</div>
      </ImportWizard>,
    );

    expect(screen.getByText('Upload your file here')).toBeInTheDocument();
  });
});
