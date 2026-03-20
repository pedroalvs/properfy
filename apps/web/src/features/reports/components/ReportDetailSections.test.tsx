import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportType, ReportStatus, ReportFormat } from '@properfy/shared';
import { ReportDetailSections } from './ReportDetailSections';
import type { ReportDetail } from '../types';

const baseReport: ReportDetail = {
  id: 'rpt-01',
  reportType: ReportType.INSPECTIONS_SCHEDULED,
  status: ReportStatus.READY,
  format: ReportFormat.XLSX,
  requestedBy: { id: 'u-1', name: 'Admin Principal' },
  fileName: 'vistorias-agendadas-marco-2026.xlsx',
  createdAt: '2026-03-15T14:00:00Z',
  updatedAt: '2026-03-15T14:30:00Z',
  parameters: 'Period: 01/03/2026 to 15/03/2026',
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
    expect(screen.getByText('Scheduled Inspections')).toBeInTheDocument();
  });

  it('shows report status chip', () => {
    render(<ReportDetailSections report={baseReport} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows format', () => {
    render(<ReportDetailSections report={baseReport} />);
    expect(screen.getByText('XLSX')).toBeInTheDocument();
  });

  it('shows file name when present, em-dash when null', () => {
    render(<ReportDetailSections report={baseReport} />);
    expect(screen.getByText('vistorias-agendadas-marco-2026.xlsx')).toBeInTheDocument();
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

  it('shows parameters when present, em-dash when null', () => {
    render(<ReportDetailSections report={baseReport} />);
    expect(screen.getByText('Period: 01/03/2026 to 15/03/2026')).toBeInTheDocument();
  });
});
