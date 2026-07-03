import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportType, ReportStatus } from '@properfy/shared';
import { ReportDetailSections } from './ReportDetailSections';
import type { ReportDetail } from '../types';

const baseReport: ReportDetail = {
  id: 'rpt-01',
  reportType: ReportType.APPOINTMENTS,
  status: ReportStatus.READY,
  requestedBy: { id: 'u-1', name: 'Admin Principal' },
  fileKey: 'reports/appointments-march-2026.xlsx',
  filters: { fromDate: '2026-03-01', toDate: '2026-03-15', dateAxis: 'SCHEDULED', groupProperties: false },
  createdAt: '2026-03-15T14:00:00Z',
  updatedAt: '2026-03-15T14:30:00Z',
  fileSize: 1048576,
};

describe('ReportDetailSections', () => {
  it('renders section titles', () => {
    render(<ReportDetailSections report={baseReport} />);
    expect(screen.getAllByText('Report').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('Request')).toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });

  it('shows report type chip', () => {
    render(<ReportDetailSections report={baseReport} />);
    expect(screen.getByText('Appointments')).toBeInTheDocument();
  });

  it('shows report status chip', () => {
    render(<ReportDetailSections report={baseReport} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('does not show a Format row', () => {
    render(<ReportDetailSections report={baseReport} />);
    expect(screen.queryByText('Format')).not.toBeInTheDocument();
  });

  it('shows file name when present, em-dash when null', () => {
    render(<ReportDetailSections report={baseReport} />);
    expect(screen.getByText('appointments-march-2026.xlsx')).toBeInTheDocument();
  });

  it('shows file size formatted when present, em-dash when null', () => {
    render(<ReportDetailSections report={baseReport} />);
    expect(screen.getByText('1.00 MB')).toBeInTheDocument();
  });

  it('shows requested by name', () => {
    render(<ReportDetailSections report={baseReport} />);
    const matches = screen.getAllByText('Admin Principal');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows filters when present, em-dash when null', () => {
    render(<ReportDetailSections report={baseReport} />);
    expect(
      screen.getByText('fromDate: 2026-03-01, toDate: 2026-03-15, dateAxis: SCHEDULED, groupProperties: false'),
    ).toBeInTheDocument();
  });

  it('shows the report error message when present', () => {
    render(
      <ReportDetailSections
        report={{
          ...baseReport,
          status: ReportStatus.FAILED,
          errorMessage: 'No appointments found for the selected agency and period.',
        }}
      />,
    );

    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.getByText('No appointments found for the selected agency and period.')).toBeInTheDocument();
  });
});
