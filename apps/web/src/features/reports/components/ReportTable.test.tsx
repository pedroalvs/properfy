import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportType, ReportStatus, ReportFormat } from '@properfy/shared';
import { ReportTable } from './ReportTable';
import type { Report } from '../types';

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'rpt-1',
    reportType: ReportType.INSPECTIONS_SCHEDULED,
    status: ReportStatus.READY,
    format: ReportFormat.XLSX,
    requestedBy: { id: 'u-1', name: 'Admin Principal' },
    fileKey: 'reports/vistorias-agendadas-marco-2026.xlsx',
    filters: { fromDate: '2026-03-01', toDate: '2026-03-15' },
    createdAt: '2026-03-15T14:00:00Z',
    updatedAt: '2026-03-15T14:00:00Z',
    ...overrides,
  };
}

describe('ReportTable', () => {
  it('renders column headers', () => {
    render(<ReportTable data={[]} />);
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('Requested By')).toBeInTheDocument();
    expect(screen.getByText('Created At')).toBeInTheDocument();
  });

  it('renders ReportTypeChip for type', () => {
    const report = makeReport({ reportType: ReportType.INSPECTIONS_DONE });
    render(<ReportTable data={[report]} />);
    expect(screen.getByText('Completed Inspections')).toBeInTheDocument();
  });

  it('renders ReportStatusChip for status', () => {
    const report = makeReport({ status: ReportStatus.PROCESSING });
    render(<ReportTable data={[report]} />);
    expect(screen.getByText('Processing')).toBeInTheDocument();
  });

  it('renders file name derived from file key or em dash', () => {
    const report = makeReport({ fileKey: null });
    render(<ReportTable data={[report]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders requestedByName', () => {
    const report = makeReport();
    render(<ReportTable data={[report]} />);
    expect(screen.getByText('Admin Principal')).toBeInTheDocument();
  });

  it('renders formatted date for createdAt', () => {
    const report = makeReport({ createdAt: '2026-03-15T14:00:00Z' });
    render(<ReportTable data={[report]} />);
    expect(screen.getByText('15/03/2026')).toBeInTheDocument();
  });

  it('shows download action when status is READY', () => {
    const report = makeReport({ status: ReportStatus.READY });
    render(<ReportTable data={[report]} />);
    expect(screen.getByLabelText('Download')).toBeInTheDocument();
  });

  it('shows retry action when status is FAILED', () => {
    const report = makeReport({ status: ReportStatus.FAILED });
    render(<ReportTable data={[report]} />);
    expect(screen.getByLabelText('Reprocess')).toBeInTheDocument();
  });

  it('shows view action for other statuses', () => {
    const report = makeReport({ status: ReportStatus.PENDING });
    render(<ReportTable data={[report]} />);
    expect(screen.getByLabelText('View')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<ReportTable data={[]} loading />);
    expect(screen.getByText('Type')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<ReportTable data={[]} />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<ReportTable data={[]} error="Network error" />);
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('download action calls onDownload', async () => {
    const userEvt = userEvent.setup();
    const onDownload = vi.fn();
    const report = makeReport({ status: ReportStatus.READY });
    render(<ReportTable data={[report]} onDownload={onDownload} />);
    await userEvt.click(screen.getByLabelText('Download'));
    expect(onDownload).toHaveBeenCalledWith(report);
  });

  it('retry action calls onRetry', async () => {
    const userEvt = userEvent.setup();
    const onRetry = vi.fn();
    const report = makeReport({ status: ReportStatus.FAILED });
    render(<ReportTable data={[report]} onRetry={onRetry} />);
    await userEvt.click(screen.getByLabelText('Reprocess'));
    expect(onRetry).toHaveBeenCalledWith(report);
  });

  it('renders scheduledReportId chip with correct href when present (Spec 019)', () => {
    const report = makeReport({ scheduledReportId: 'sched-abc-001' });
    render(<ReportTable data={[report]} />);
    const chip = screen.getByTestId('scheduled-report-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('href', '/scheduled-reports/sched-abc-001');
    expect(chip).toHaveAttribute('title', 'From scheduled report');
  });

  it('does not render scheduledReportId chip when field is absent or null', () => {
    const report = makeReport({ scheduledReportId: null });
    render(<ReportTable data={[report]} />);
    expect(screen.queryByTestId('scheduled-report-chip')).not.toBeInTheDocument();
  });

  it('renders chip for scheduled row and no chip for non-scheduled row in same table', () => {
    const scheduled = makeReport({ id: 'rpt-A', scheduledReportId: 'sched-xyz' });
    const manual = makeReport({ id: 'rpt-B', scheduledReportId: null });
    render(<ReportTable data={[scheduled, manual]} />);
    const chips = screen.getAllByTestId('scheduled-report-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveAttribute('href', '/scheduled-reports/sched-xyz');
  });
});
