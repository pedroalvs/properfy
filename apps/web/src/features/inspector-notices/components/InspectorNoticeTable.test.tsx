import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InspectorNoticeTable } from './InspectorNoticeTable';
import type { InspectorNoticeSummary } from '../types';

function notice(overrides: Partial<InspectorNoticeSummary> = {}): InspectorNoticeSummary {
  return {
    id: 'n1',
    title: 'Road closure',
    body: 'Pacific Hwy closed',
    critical: false,
    audience: { type: 'ALL' },
    author: { type: 'USER', name: 'Ana Op' },
    publishedAt: '2026-11-10T22:30:00Z',
    archivedAt: null,
    recipientCount: 10,
    readCount: 3,
    ...overrides,
  };
}

const pagination = { page: 1, pageSize: 20, total: 2, onChange: vi.fn() };

function renderTable(data: InspectorNoticeSummary[], onOpen = vi.fn()) {
  render(
    <InspectorNoticeTable data={data} loading={false} onRetryError={vi.fn()} pagination={pagination} onOpen={onOpen} />,
  );
  return onOpen;
}

describe('InspectorNoticeTable', () => {
  it('renders the contract columns, chips and read counts', () => {
    renderTable([
      notice({ id: 'a', title: 'Critical one', critical: true, recipientCount: 10, readCount: 3 }),
      notice({
        id: 'b',
        title: 'Region one',
        critical: false,
        audience: { type: 'REGION', regionId: 'r1', regionName: 'North Shore' },
        recipientCount: 4,
        readCount: 0,
      }),
    ]);
    expect(screen.getByText('Critical one')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument(); // only the first row
    expect(screen.getByText('All active inspectors')).toBeInTheDocument();
    expect(screen.getByText('Region: North Shore')).toBeInTheDocument();
    expect(screen.getByText('3/10')).toBeInTheDocument();
    expect(screen.getByText('0/4')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBe(2);
  });

  it('shows the author name or System', () => {
    renderTable([
      notice({ id: 'a', author: { type: 'USER', name: 'Ana Op' } }),
      notice({ id: 'b', author: { type: 'SYSTEM', name: null }, audience: { type: 'SYSTEM', systemType: 'ROUTE_PUBLISHED' } }),
    ]);
    expect(screen.getByText('Ana Op')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('Automatic')).toBeInTheDocument();
  });

  it('renders the selected-audience summary', () => {
    renderTable([notice({ audience: { type: 'SELECTED', inspectorIds: ['a', 'b', 'c'] } })]);
    expect(screen.getByText('3 selected inspectors')).toBeInTheDocument();
  });

  it('shows the Archived status for an archived notice', () => {
    renderTable([notice({ archivedAt: '2026-11-11T00:00:00Z' })]);
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('opens a notice from a keyboard-operable native button', () => {
    const onOpen = renderTable([notice({ id: 'n7', title: 'Road closure' })]);
    const button = screen.getByRole('button', { name: 'Open notice Road closure' });
    // A native <button> is focusable and activates on Enter/Space by default.
    expect(button.tagName).toBe('BUTTON');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith('n7');
  });
});
