/**
 * GroupMapDetailPanel — single-click group-pin preview popup (Groups mode).
 *
 * Invariants:
 *   - Renders name (fallback "Service group"), status chip label, size, date
 *     and a time range derived from the group's appointments — no fetch of
 *     its own (the page supplies `appointments`).
 *   - Close button and ESC call onClose.
 *   - VIEW GROUP links to /service-groups/{id} (same tab).
 *   - The second footer button follows the status: PUBLISH on DRAFT,
 *     UNPUBLISH on PUBLISHED, nothing at all on ACCEPTED/CANCELLED/REJECTED.
 *   - PUBLISH calls onPublish and is enabled only for DRAFT groups that are
 *     non-empty and not past-dated (mirrors the backend publish guards).
 *   - Both actions are AM/OP-only — the endpoints are, and /map is not.
 *   - Focus moves into the dialog on open.
 *   - Renders nothing when group is null.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
    <MemoryRouter>
      <GroupMapDetailPanel
        group={sampleGroup}
        actorRole="AM"
        onClose={vi.fn()}
        onPublish={vi.fn()}
        onUnpublish={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

// PUBLISH is gated on the group schedule, resolved against "now" in Sydney.
// Pin the clock (Date only) so `sampleGroup` stays future-dated forever.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
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

  it('shows the group code next to the name when present', () => {
    renderPanel({ group: { ...sampleGroup, code: '37' } });
    expect(screen.getByRole('heading', { name: /North Shore run\s*#37/ })).toBeInTheDocument();
  });

  it('shows the group code next to the fallback title when name is null', () => {
    renderPanel({ group: { ...sampleGroup, name: null, code: '37' } });
    expect(screen.getByRole('heading', { name: /Service group\s*#37/ })).toBeInTheDocument();
  });

  it('omits the code marker when the group has no code', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'North Shore run' })).toBeInTheDocument();
    expect(screen.queryByText(/#/)).toBeNull();
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
    expect(screen.getByTestId('group-map-detail-when')).toHaveTextContent('8:30 am – 2:15 pm');
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

  it('VIEW GROUP links to the group detail page in the same tab', () => {
    renderPanel();
    const link = screen.getByTestId('group-map-detail-view');
    expect(link).toHaveAttribute('href', `/service-groups/${sampleGroup.id}`);
    expect(link).not.toHaveAttribute('target');
  });

  it('offers UNPUBLISH — not a dead PUBLISH — for a PUBLISHED group', () => {
    renderPanel();
    expect(screen.queryByTestId('group-map-detail-publish')).toBeNull();
    expect(screen.getByTestId('group-map-detail-unpublish')).toBeEnabled();
  });

  it.each([ServiceGroupStatus.ACCEPTED, ServiceGroupStatus.CANCELLED, ServiceGroupStatus.REJECTED])(
    'offers no action button at all for a %s group',
    (status) => {
      renderPanel({ group: { ...sampleGroup, status } });
      expect(screen.queryByTestId('group-map-detail-publish')).toBeNull();
      expect(screen.queryByTestId('group-map-detail-unpublish')).toBeNull();
      // VIEW GROUP is still the way in.
      expect(screen.getByTestId('group-map-detail-view')).toBeInTheDocument();
    },
  );

  it('UNPUBLISH calls onUnpublish', () => {
    const onUnpublish = vi.fn();
    renderPanel({ onUnpublish });
    fireEvent.click(screen.getByTestId('group-map-detail-unpublish'));
    expect(onUnpublish).toHaveBeenCalledTimes(1);
  });

  it('UNPUBLISH shows the in-flight state while unpublishing', () => {
    renderPanel({ isUnpublishing: true });
    const btn = screen.getByTestId('group-map-detail-unpublish');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent(/unpublishing/i);
  });

  it.each(['CL_ADMIN', 'CL_USER'] as const)(
    'hides both actions from %s — /map is open to them, the endpoints are not',
    (actorRole) => {
      const { unmount } = renderPanel({ actorRole });
      expect(screen.queryByTestId('group-map-detail-unpublish')).toBeNull();
      expect(screen.getByTestId('group-map-detail-view')).toBeInTheDocument();
      unmount();

      renderPanel({ actorRole, group: { ...sampleGroup, status: ServiceGroupStatus.DRAFT } });
      expect(screen.queryByTestId('group-map-detail-publish')).toBeNull();
    },
  );

  it('shows both actions to OP', () => {
    const { unmount } = renderPanel({ actorRole: 'OP' });
    expect(screen.getByTestId('group-map-detail-unpublish')).toBeInTheDocument();
    unmount();

    renderPanel({ actorRole: 'OP', group: { ...sampleGroup, status: ServiceGroupStatus.DRAFT } });
    expect(screen.getByTestId('group-map-detail-publish')).toBeInTheDocument();
  });

  it('PUBLISH calls onPublish for DRAFT groups', () => {
    const onPublish = vi.fn();
    renderPanel({ onPublish, group: { ...sampleGroup, status: ServiceGroupStatus.DRAFT } });
    const btn = screen.getByTestId('group-map-detail-publish');
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('PUBLISH is disabled for an empty DRAFT group and explains why', () => {
    const onPublish = vi.fn();
    renderPanel({
      onPublish,
      group: { ...sampleGroup, status: ServiceGroupStatus.DRAFT, groupSize: 0 },
    });
    const btn = screen.getByTestId('group-map-detail-publish');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onPublish).not.toHaveBeenCalled();
    expect(screen.getByTestId('group-map-detail-publish-reason')).toHaveTextContent(
      /no appointments/i,
    );
  });

  it('PUBLISH is disabled for a past-dated DRAFT group', () => {
    const onPublish = vi.fn();
    renderPanel({
      onPublish,
      group: { ...sampleGroup, status: ServiceGroupStatus.DRAFT, scheduledDate: '2026-06-30' },
    });
    const btn = screen.getByTestId('group-map-detail-publish');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onPublish).not.toHaveBeenCalled();
    expect(screen.getByTestId('group-map-detail-publish-reason')).toHaveTextContent(/past/i);
  });

  it('PUBLISH is disabled when today’s time window has already started', () => {
    renderPanel({
      group: {
        ...sampleGroup,
        status: ServiceGroupStatus.DRAFT,
        // 2026-07-01T00:00:00Z is 10:00 in Sydney.
        scheduledDate: '2026-07-01',
        timeWindow: '08:00-11:00',
      },
    });
    expect(screen.getByTestId('group-map-detail-publish')).toBeDisabled();
  });

  it('PUBLISH is disabled while an appointment is not awaiting inspector', () => {
    const onPublish = vi.fn();
    renderPanel({
      onPublish,
      group: { ...sampleGroup, status: ServiceGroupStatus.DRAFT },
      appointments: [
        { code: 'INS-0001', status: 'AWAITING_INSPECTOR', timeSlotStart: '09:00', timeSlotEnd: '12:00' },
        { code: 'INS-0002', status: 'CANCELLED', timeSlotStart: '09:00', timeSlotEnd: '12:00' },
      ],
    });
    const btn = screen.getByTestId('group-map-detail-publish');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onPublish).not.toHaveBeenCalled();
    expect(screen.getByTestId('group-map-detail-publish-reason')).toHaveTextContent(
      /#INS-0002 \(CANCELLED\)/,
    );
  });

  it('does not point aria-describedby at an unrendered reason when nothing blocks publishing', () => {
    renderPanel({ group: { ...sampleGroup, status: ServiceGroupStatus.DRAFT } });
    expect(screen.getByTestId('group-map-detail-publish')).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByTestId('group-map-detail-publish-reason')).toBeNull();
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
