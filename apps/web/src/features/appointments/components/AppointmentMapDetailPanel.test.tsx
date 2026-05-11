/**
 * AppointmentMapDetailPanel (025 §FR-451..460) — pins the three core
 * behaviours called out by the plan:
 *  1. CLIENT + PROPERTIES render from the marker payload without fetching.
 *  2. All 8 collapsibles start CLOSED — first expand triggers the lazy
 *     detail fetch (`useAppointmentDetail` called with the id, not null).
 *  3. Clicking a DIFFERENT marker resets the collapsibles and re-fetches.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppointmentMapDetailPanel } from './AppointmentMapDetailPanel';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

// Capture the id passed to useAppointmentDetail so we can assert lazy fetch.
const detailIdSpy = vi.fn();

vi.mock('../hooks/useAppointmentDetail', () => ({
  useAppointmentDetail: (id: string | null) => {
    detailIdSpy(id);
    return { appointment: null, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

const sampleAppointment: AppointmentMapItem = {
  id: 'aaaaaaaa-0000-4000-8000-000000000010',
  code: 'INS-0042',
  status: 'SCHEDULED',
  propertyAddress: '123 Pitt St, Sydney NSW 2000',
  latitude: -33.8,
  longitude: 151.2,
  scheduledDate: '2026-06-01',
  timeSlot: '09:00-10:00',
  inspectorName: 'Alice Smith',
  branchName: 'Sydney',
  tenantName: 'Acme Realty',
  contactName: 'Bob',
  contactPhone: '+61400000000',
  contactEmail: 'b@example.com',
  tenantConfirmationStatus: 'PENDING',
  serviceTypeName: 'Routine inspection',
};

function renderPanel(props: Partial<Parameters<typeof AppointmentMapDetailPanel>[0]> = {}) {
  detailIdSpy.mockClear();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppointmentMapDetailPanel
          appointment={sampleAppointment}
          open
          anchor={{ x: 400, y: 300 }}
          onClose={vi.fn()}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppointmentMapDetailPanel', () => {
  it('renders CLIENT and PROPERTIES from the marker payload without fetching detail', () => {
    renderPanel();
    expect(screen.getByTestId('map-detail-client').textContent).toBe('Acme Realty');
    expect(screen.getByText('123 Pitt St, Sydney NSW 2000')).toBeInTheDocument();
    // useAppointmentDetail is invoked with null while no section is expanded.
    expect(detailIdSpy).toHaveBeenCalledWith(null);
  });

  it('all collapsible sections start closed', () => {
    renderPanel();
    const sections = ['confirmation', 'meeting', 'contacts', 'service', 'restrictions', 'notes', 'history', 'financials'];
    sections.forEach((key) => {
      const btn = screen.getByTestId(`map-detail-section-${key}`);
      expect(btn.getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('first expand triggers useAppointmentDetail with the appointment id', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('map-detail-section-meeting'));
    // The last call after the click should be with the actual id (not null).
    expect(detailIdSpy).toHaveBeenLastCalledWith(sampleAppointment.id);
  });

  it('switching to a different appointment resets collapsed state', () => {
    const { rerender } = renderPanel();
    fireEvent.click(screen.getByTestId('map-detail-section-meeting'));
    expect(screen.getByTestId('map-detail-section-meeting').getAttribute('aria-expanded')).toBe('true');

    const other = { ...sampleAppointment, id: 'bbbbbbbb-0000-4000-8000-000000000099', code: 'INS-0099' };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AppointmentMapDetailPanel
            appointment={other}
            open
            anchor={{ x: 400, y: 300 }}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('map-detail-section-meeting').getAttribute('aria-expanded')).toBe('false');
  });

  it('MORE DETAILS CTA opens the appointment detail page in a new tab', () => {
    const onMoreDetails = vi.fn();
    renderPanel({ onMoreDetails });
    fireEvent.click(screen.getByTestId('map-detail-more-details'));
    expect(onMoreDetails).toHaveBeenCalledWith(sampleAppointment.id);
  });

  // 025 round-2 regression — Issue #2. User rejected the side-drawer
  // variant in smoke testing. The component MUST be a floating popup
  // anchored to the clicked marker's screen-pixel coords, not a fixed
  // side panel.
  it('renders as a floating popup positioned at the marker anchor coords', () => {
    renderPanel({ anchor: { x: 412, y: 256 } });
    const panel = screen.getByTestId('appointment-map-detail-panel');
    // `position: absolute` instead of the DrawerPanel's `position: fixed`.
    expect(panel.style.position).toBe('absolute');
    expect(panel.style.left).toBe('412px');
    expect(panel.style.top).toBe('256px');
    // The DrawerPanel CSS had `right: 0; top: 0; h-screen` (full-height
    // side rail). The popup must NOT carry those styles.
    expect(panel.className).not.toContain('h-screen');
  });

  it('renders nothing when anchor is null (marker has no projected coords yet)', () => {
    const { container } = renderPanel({ anchor: null });
    expect(container.querySelector('[data-testid="appointment-map-detail-panel"]')).toBeNull();
  });

  it('flips above the marker when there is room (anchor.y > 260)', () => {
    renderPanel({ anchor: { x: 400, y: 500 } });
    const panel = screen.getByTestId('appointment-map-detail-panel');
    expect(panel.style.transform).toContain('-100%');
  });

  it('flips below the marker when near the top of the viewport (anchor.y <= 260)', () => {
    renderPanel({ anchor: { x: 400, y: 80 } });
    const panel = screen.getByTestId('appointment-map-detail-panel');
    expect(panel.style.transform).not.toContain('-100%');
  });
});
