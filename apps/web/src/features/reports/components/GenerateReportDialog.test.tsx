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

function selectOption(fieldLabel: string, optionName: string) {
  fireEvent.click(screen.getByLabelText(fieldLabel));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}

describe('GenerateReportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFormOptions.mockImplementation((_key: unknown, path: string) => {
      if (path === '/v1/branches') {
        return {
          options: [
            { value: 'branch-1', label: 'Branch One' },
            { value: 'branch-2', label: 'Branch Two' },
          ],
          isLoading: false,
        };
      }
      return {
        options: [
          { value: 'tenant-1', label: 'Agency One' },
          { value: 'tenant-2', label: 'Agency Two' },
        ],
        isLoading: false,
      };
    });
  });

  it('offers exactly the four report types', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-1', role: 'AM', tenantId: null } });

    render(
      <GenerateReportDialog open onClose={() => {}} onSubmit={vi.fn()} isSubmitting={false} />,
    );

    fireEvent.click(screen.getByLabelText('Report Type'));
    expect(screen.getByRole('option', { name: 'Appointments' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Financial' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Performance' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Agencies' })).toBeInTheDocument();
  });

  it('lets global roles generate a cross-agency report without selecting an agency', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-1', role: 'AM', tenantId: null } });

    const onSubmit = vi.fn();
    render(
      <GenerateReportDialog open onClose={() => {}} onSubmit={onSubmit} isSubmitting={false} />,
    );

    // No agency selected — an empty agency means "all agencies".
    selectOption('Report Type', 'Appointments');
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-03-31' } });
    fireEvent.click(screen.getByText('Generate'));

    expect(screen.queryByText('Agency is required')).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.reportType).toBe('APPOINTMENTS');
    expect(arg.filters).not.toHaveProperty('tenantId');
  });

  it('submits the full filters shape for global roles (no format field)', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-1', role: 'OP', tenantId: null } });

    const onSubmit = vi.fn();
    render(
      <GenerateReportDialog open onClose={() => {}} onSubmit={onSubmit} isSubmitting={false} />,
    );

    selectOption('Agency', 'Agency One');
    selectOption('Report Type', 'Appointments');
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-03-31' } });
    fireEvent.click(screen.getByText('Generate'));

    expect(onSubmit).toHaveBeenCalledWith({
      reportType: 'APPOINTMENTS',
      filters: {
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
        dateAxis: 'SCHEDULED',
        groupProperties: false,
        tenantId: 'tenant-1',
      },
    });
  });

  it('includes status and groupProperties when set for an Appointments report', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-1', role: 'CL_ADMIN', tenantId: 'tenant-9' } });

    const onSubmit = vi.fn();
    render(
      <GenerateReportDialog open onClose={() => {}} onSubmit={onSubmit} isSubmitting={false} />,
    );

    selectOption('Report Type', 'Appointments');
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-03-31' } });
    selectOption('Status', 'Done');
    fireEvent.click(screen.getByLabelText('Group by property'));
    fireEvent.click(screen.getByText('Generate'));

    expect(onSubmit).toHaveBeenCalledWith({
      reportType: 'APPOINTMENTS',
      filters: {
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
        dateAxis: 'SCHEDULED',
        groupProperties: true,
        status: 'DONE',
      },
    });
  });

  it('shows Status and Group only for Appointments', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-1', role: 'CL_ADMIN', tenantId: 'tenant-1' } });

    render(
      <GenerateReportDialog open onClose={() => {}} onSubmit={vi.fn()} isSubmitting={false} />,
    );

    // No report type selected yet: no Status / Group controls.
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Group by property')).not.toBeInTheDocument();

    selectOption('Report Type', 'Appointments');
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Group by property')).toBeInTheDocument();

    selectOption('Report Type', 'Financial');
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Group by property')).not.toBeInTheDocument();
  });

  it('hides the Date Axis control for Financial reports', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-1', role: 'CL_ADMIN', tenantId: 'tenant-1' } });

    render(
      <GenerateReportDialog open onClose={() => {}} onSubmit={vi.fn()} isSubmitting={false} />,
    );

    selectOption('Report Type', 'Performance');
    expect(screen.getByLabelText('Date Axis')).toBeInTheDocument();

    selectOption('Report Type', 'Financial');
    expect(screen.queryByLabelText('Date Axis')).not.toBeInTheDocument();
  });

  it('does not show agency selector for tenant-scoped roles', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u-1', role: 'CL_ADMIN', tenantId: 'tenant-1' } });

    render(
      <GenerateReportDialog open onClose={() => {}} onSubmit={vi.fn()} isSubmitting={false} />,
    );

    expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
  });
});
