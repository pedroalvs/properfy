import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportType, ReportStatus } from '@properfy/shared';
import { ReportTable } from './ReportTable';
import type { Report } from '../types';

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'rpt-1',
    reportType: ReportType.APPOINTMENTS,
    status: ReportStatus.READY,
    requestedBy: { id: 'u-1', name: 'Admin Principal' },
    fileKey: 'reports/appointments-march-2026.xlsx',
    filters: {
      fromDate: '2026-03-01',
      toDate: '2026-03-15',
      dateAxis: 'SCHEDULED',
      groupProperties: false,
    },
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
    const report = makeReport({ reportType: ReportType.FINANCIAL });
    render(<ReportTable data={[report]} />);
    expect(screen.getByText('Financial')).toBeInTheDocument();
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
});
