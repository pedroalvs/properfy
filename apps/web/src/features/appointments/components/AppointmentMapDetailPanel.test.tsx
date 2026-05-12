/**
 * 025 cycle 2/2 — AppointmentMapDetailPanel is now CONTENT-ONLY. The
 * positioning + edge clamping + flip direction logic that the earlier
 * rounds carried have been deleted; `AppointmentMapPage` mounts this
 * component inside a Mapbox-native Popup via `createPortal`, so Mapbox
 * handles screen-position tracking per render frame.
 *
 * These tests cover the content surface only:
 *   - CLIENT + PROPERTIES from the marker payload (no fetch).
 *   - 8 collapsibles closed by default; first expand triggers lazy fetch.
 *   - Marker-switch resets collapsed state.
 *   - MORE DETAILS callback opens the detail page.
 *
 * Tests that exercise the Mapbox Popup follow-the-marker behaviour live
 * in `AppointmentMapPage.popup-follow.test.tsx` (which mocks `mapboxgl.Popup`
 * and asserts setLngLat / setDOMContent / addTo / remove are wired
 * correctly). Per `feedback_mock_masks_real_bug.md`, the visual-rect
 * tests for clamping are no longer needed — clamping is gone.
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
          onClose={vi.fn()}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppointmentMapDetailPanel (content)', () => {
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

  it('panel renders with NO absolute positioning — Mapbox Popup owns positioning now', () => {
    renderPanel();
    const panel = screen.getByTestId('appointment-map-detail-panel');
    // The CONTENT panel has no position style; the Mapbox Popup is the
    // positioned parent that wraps this when mounted on the map.
    expect(panel.style.position).toBe('');
    expect(panel.style.left).toBe('');
    expect(panel.style.top).toBe('');
    // No `h-screen`, no `fixed right-0 top-0` — drawer styling is gone.
    expect(panel.className).not.toContain('h-screen');
    expect(panel.className).not.toContain('fixed');
  });

  it('ESC closes the panel', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when appointment is null', () => {
    const { container } = renderPanel({ appointment: null });
    expect(container.querySelector('[data-testid="appointment-map-detail-panel"]')).toBeNull();
  });
});
