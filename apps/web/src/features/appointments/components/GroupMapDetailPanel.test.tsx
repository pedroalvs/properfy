/**
 * GroupMapDetailPanel — single-click group-pin preview popup (Groups mode).
 *
 * Invariants:
 *   - Renders name (fallback "Service group"), status chip label, size, date
 *     and a time range derived from the group's appointments — no fetch of
 *     its own (the page supplies `appointments`).
 *   - Close button and ESC call onClose.
 *   - VIEW GROUP opens /service-groups/{id} in a new tab.
 *   - PUBLISH calls onPublish and is enabled only for DRAFT groups.
 *   - Focus moves into the dialog on open.
 *   - Renders nothing when group is null.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
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
      onPublish={vi.fn()}
      {...props}
    />,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('shows the min-start / max-end time range across the appointments', () => {
    renderPanel({
      appointments: [
        { timeSlotStart: '10:00', timeSlotEnd: '11:00' },
        { timeSlotStart: '08:30', timeSlotEnd: '09:30' },
        { timeSlotStart: '13:00', timeSlotEnd: '14:15' },
      ],
    });
    expect(screen.getByTestId('group-map-detail-when')).toHaveTextContent('08:30 - 14:15');
  });

  it('omits the time range when appointments are missing or empty', () => {
    renderPanel({ appointments: [] });
    expect(screen.getByTestId('group-map-detail-when').textContent).not.toMatch(/\d{2}:\d{2}/);
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

  it('VIEW GROUP opens the group detail page in a new tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderPanel();
    fireEvent.click(screen.getByTestId('group-map-detail-view'));
    expect(openSpy).toHaveBeenCalledWith(`/service-groups/${sampleGroup.id}`, '_blank');
  });

  it('PUBLISH is disabled for non-DRAFT groups and never fires onPublish', () => {
    const onPublish = vi.fn();
    renderPanel({ onPublish });
    const btn = screen.getByTestId('group-map-detail-publish');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('PUBLISH calls onPublish for DRAFT groups', () => {
    const onPublish = vi.fn();
    renderPanel({ onPublish, group: { ...sampleGroup, status: ServiceGroupStatus.DRAFT } });
    const btn = screen.getByTestId('group-map-detail-publish');
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('PUBLISH shows the in-flight state while publishing', () => {
    renderPanel({
      group: { ...sampleGroup, status: ServiceGroupStatus.DRAFT },
      isPublishing: true,
    });
    const btn = screen.getByTestId('group-map-detail-publish');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/publishing/i);
  });

  it('moves focus into the dialog on open', () => {
    renderPanel();
    expect(screen.getByTestId('group-map-detail-panel')).toHaveFocus();
  });
});
