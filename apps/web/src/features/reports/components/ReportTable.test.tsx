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
    requestedByName: 'Admin Principal',
    fileName: 'vistorias-agendadas-marco-2026.xlsx',
    createdAt: '2026-03-15T14:00:00Z',
    updatedAt: '2026-03-15T14:00:00Z',
    ...overrides,
  };
}

describe('ReportTable', () => {
  it('renders column headers', () => {
    render(<ReportTable data={[]} />);
    expect(screen.getByText('Tipo')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Arquivo')).toBeInTheDocument();
    expect(screen.getByText('Solicitado Por')).toBeInTheDocument();
    expect(screen.getByText('Criado Em')).toBeInTheDocument();
  });

  it('renders ReportTypeChip for type', () => {
    const report = makeReport({ reportType: ReportType.INSPECTIONS_DONE });
    render(<ReportTable data={[report]} />);
    expect(screen.getByText('Vistorias Concluídas')).toBeInTheDocument();
  });

  it('renders ReportStatusChip for status', () => {
    const report = makeReport({ status: ReportStatus.PROCESSING });
    render(<ReportTable data={[report]} />);
    expect(screen.getByText('Processando')).toBeInTheDocument();
  });

  it('renders fileName or em dash', () => {
    const report = makeReport({ fileName: null });
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
    expect(screen.getByLabelText('Baixar')).toBeInTheDocument();
  });

  it('shows retry action when status is FAILED', () => {
    const report = makeReport({ status: ReportStatus.FAILED });
    render(<ReportTable data={[report]} />);
    expect(screen.getByLabelText('Reprocessar')).toBeInTheDocument();
  });

  it('shows view action for other statuses', () => {
    const report = makeReport({ status: ReportStatus.PENDING });
    render(<ReportTable data={[report]} />);
    expect(screen.getByLabelText('Visualizar')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<ReportTable data={[]} loading />);
    expect(screen.getByText('Tipo')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<ReportTable data={[]} />);
    expect(screen.getByText('Nenhum registro encontrado')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<ReportTable data={[]} error="Erro de rede" />);
    expect(screen.getByText('Erro de rede')).toBeInTheDocument();
  });

  it('download action calls onDownload', async () => {
    const userEvt = userEvent.setup();
    const onDownload = vi.fn();
    const report = makeReport({ status: ReportStatus.READY });
    render(<ReportTable data={[report]} onDownload={onDownload} />);
    await userEvt.click(screen.getByLabelText('Baixar'));
    expect(onDownload).toHaveBeenCalledWith(report);
  });

  it('retry action calls onRetry', async () => {
    const userEvt = userEvent.setup();
    const onRetry = vi.fn();
    const report = makeReport({ status: ReportStatus.FAILED });
    render(<ReportTable data={[report]} onRetry={onRetry} />);
    await userEvt.click(screen.getByLabelText('Reprocessar'));
    expect(onRetry).toHaveBeenCalledWith(report);
  });
});
