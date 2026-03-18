import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressStep } from './ProgressStep';

describe('ProgressStep', () => {
  it('shows progress bar', () => {
    render(
      <ProgressStep
        status="PROCESSING"
        progress={45}
        successCount={0}
        errorCount={0}
        errors={[]}
      />,
    );

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '45');
    expect(screen.getByTestId('progress-percentage')).toHaveTextContent('45%');
  });

  it('shows processing state', () => {
    render(
      <ProgressStep
        status="PROCESSING"
        progress={30}
        successCount={0}
        errorCount={0}
        errors={[]}
      />,
    );

    expect(screen.getByText('Processing import...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows completed state with counts', () => {
    render(
      <ProgressStep
        status="COMPLETED"
        progress={100}
        successCount={48}
        errorCount={2}
        errors={[
          { row: 5, message: 'Invalid email' },
          { row: 12, message: 'Missing address' },
        ]}
      />,
    );

    expect(screen.getByText('Import completed')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
    expect(screen.getByText('Imported Successfully')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows failed state with errors', () => {
    const errors = [
      { row: 1, message: 'Server error on row 1' },
      { row: 3, message: 'Duplicate entry' },
    ];

    render(
      <ProgressStep
        status="FAILED"
        progress={60}
        successCount={10}
        errorCount={2}
        errors={errors}
      />,
    );

    expect(screen.getByText('Import failed')).toBeInTheDocument();
    expect(screen.getByText('Import Errors')).toBeInTheDocument();
    expect(screen.getByText('Server error on row 1')).toBeInTheDocument();
    expect(screen.getByText('Duplicate entry')).toBeInTheDocument();
  });

  it('does not show results summary during processing', () => {
    render(
      <ProgressStep
        status="PROCESSING"
        progress={50}
        successCount={0}
        errorCount={0}
        errors={[]}
      />,
    );

    expect(screen.queryByText('Imported Successfully')).not.toBeInTheDocument();
  });
});
