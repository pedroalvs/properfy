import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GenerateReportDialog } from './GenerateReportDialog';

const mockUseAuth = vi.fn();
const mockUseFormOptions = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: (...args: unknown[]) => mockUseFormOptions(...args),
}));

describe('GenerateReportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFormOptions.mockReturnValue({
      options: [
        { value: 'tenant-1', label: 'Agency One' },
        { value: 'tenant-2', label: 'Agency Two' },
      ],
      isLoading: false,
    });
  });

  it('requires agency selection for global roles', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u-1', role: 'AM', tenantId: null },
    });

    const onSubmit = vi.fn();

    render(
      <GenerateReportDialog
        open
        onClose={() => {}}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );

    fireEvent.click(screen.getByLabelText('Report Type'));
    fireEvent.click(screen.getByRole('option', { name: 'Scheduled Inspections' }));
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-03-31' } });
    fireEvent.click(screen.getByText('Generate'));

    expect(await screen.findByText('Agency is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits tenantId for global roles', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u-1', role: 'OP', tenantId: null },
    });

    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <GenerateReportDialog
        open
        onClose={() => {}}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );

    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(screen.getByRole('option', { name: 'Agency One' }));
    fireEvent.click(screen.getByLabelText('Report Type'));
    fireEvent.click(screen.getByRole('option', { name: 'Scheduled Inspections' }));
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-03-31' } });
    fireEvent.click(screen.getByText('Generate'));

    expect(onSubmit).toHaveBeenCalledWith({
      reportType: 'INSPECTIONS_SCHEDULED',
      fromDate: '2026-03-01',
      toDate: '2026-03-31',
      tenantId: 'tenant-1',
    });
  });

  it('does not show agency selector for tenant-scoped roles', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u-1', role: 'CL_ADMIN', tenantId: 'tenant-1' },
    });

    render(
      <GenerateReportDialog
        open
        onClose={() => {}}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />,
    );

    expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
  });
});
