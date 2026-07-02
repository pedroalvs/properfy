/**
 * GroupMapDetailPanel — single-click group-pin preview popup (Groups mode).
 *
 * Invariants:
 *   - Renders name (fallback "Service group"), status chip label, size and date
 *     straight from the pin payload — no fetch.
 *   - Close button and ESC call onClose.
 *   - OPEN GROUP calls onOpenGroup (same drill-down as double-click).
 *   - Renders nothing when group is null.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupMapDetailPanel } from './GroupMapDetailPanel';
import { ServiceGroupStatus } from '@properfy/shared';

const sampleGroup = {
  id: 'gggggggg-0000-4000-8000-000000000001',
  name: 'North Shore run',
  status: ServiceGroupStatus.PUBLISHED,
  groupSize: 4,
  scheduledDate: '2026-07-10',
};

function renderPanel(props: Partial<Parameters<typeof GroupMapDetailPanel>[0]> = {}) {
  return render(
    <GroupMapDetailPanel
      group={sampleGroup}
      onClose={vi.fn()}
      onOpenGroup={vi.fn()}
      {...props}
    />,
  );
}

describe('GroupMapDetailPanel', () => {
  it('renders nothing when group is null', () => {
    renderPanel({ group: null });
    expect(screen.queryByTestId('group-map-detail-panel')).toBeNull();
  });

  it('renders name, status label, appointment count and date from the pin payload', () => {
    renderPanel();
    expect(screen.getByText('North Shore run')).toBeInTheDocument();
    expect(screen.getByText('Awaiting Inspector')).toBeInTheDocument();
    expect(screen.getByTestId('group-map-detail-size')).toHaveTextContent('4 appointments');
  });

  it('falls back to "Service group" when name is null', () => {
    renderPanel({ group: { ...sampleGroup, name: null } });
    expect(screen.getByText('Service group')).toBeInTheDocument();
  });

  it('uses singular "appointment" for groupSize 1', () => {
    renderPanel({ group: { ...sampleGroup, groupSize: 1 } });
    expect(screen.getByTestId('group-map-detail-size')).toHaveTextContent('1 appointment');
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByLabelText('Close popup'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ESC calls onClose', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('OPEN GROUP calls onOpenGroup', () => {
    const onOpenGroup = vi.fn();
    renderPanel({ onOpenGroup });
    fireEvent.click(screen.getByTestId('group-map-detail-open'));
    expect(onOpenGroup).toHaveBeenCalledTimes(1);
  });
});
