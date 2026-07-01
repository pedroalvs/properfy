/**
 * 026 cycle 2/2 — AppointmentMapDetailPanel now eagerly fetches detail on
 * pin click instead of lazily on first section expand (026 BUG-001).
 *
 * Invariants (as of 026 cycle 2/2):
 *   - CLIENT + PROPERTIES from the marker payload (no fetch required for
 *     these two fields — they render immediately from the AppointmentMapItem).
 *   - Eager fetch on pin click: useAppointmentDetail fires with the appointment
 *     id on mount, before any section is expanded.
 *   - 8 collapsibles closed by default.
 *   - Single fetch regardless of multiple expands (React Query caches).
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
  timeSlotStart: '09:00', timeSlotEnd: '10:00',
  inspectorName: 'Alice Smith',
  branchName: 'Sydney',
  clientName: 'Acme Realty',
  contactName: 'Bob',
  contactPhone: '+61400000000',
  contactEmail: 'b@example.com',
  rentalTenantConfirmationStatus: 'PENDING',
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
  it('renders CLIENT and PROPERTIES from the marker payload; eager fetch starts on mount', () => {
    renderPanel();
    expect(screen.getByTestId('map-detail-client').textContent).toBe('Acme Realty');
    expect(screen.getByText('123 Pitt St, Sydney NSW 2000')).toBeInTheDocument();
    // 026 BUG-001: eager fetch — useAppointmentDetail fires immediately with
    // the appointment id. CLIENT/PROPERTIES still come from marker data and
    // render without waiting for the detail response.
    expect(detailIdSpy).toHaveBeenCalledWith(sampleAppointment.id);
  });

  it('all collapsible sections start closed', () => {
    renderPanel();
    const sections = ['confirmation', 'meeting', 'contacts', 'service', 'restrictions', 'notes', 'history', 'financials'];
    sections.forEach((key) => {
      const btn = screen.getByTestId(`map-detail-section-${key}`);
      expect(btn.getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('eager fetch on pin click: useAppointmentDetail fires on mount without any expand', () => {
    renderPanel();
    // No click needed — detail is fetched immediately.
    expect(detailIdSpy).toHaveBeenCalledWith(sampleAppointment.id);
    expect(detailIdSpy).not.toHaveBeenCalledWith(null);
  });

  it('detail fetch does not re-fire when multiple sections are expanded (single aggregator)', () => {
    renderPanel();
    // Capture the call count after mount.
    const callsAfterMount = detailIdSpy.mock.calls.length;
    // Expanding several sections should NOT add calls with null (no reset to
    // lazy state) — each expand only triggers a re-render which re-invokes
    // the hook with the same id, still cached by React Query.
    fireEvent.click(screen.getByTestId('map-detail-section-meeting'));
    fireEvent.click(screen.getByTestId('map-detail-section-contacts'));
    fireEvent.click(screen.getByTestId('map-detail-section-notes'));
    // Every call should be with the appointment id, never with null.
    detailIdSpy.mock.calls.slice(callsAfterMount).forEach(([id]) => {
      expect(id).toBe(sampleAppointment.id);
    });
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

  // 025 cycle 3/2 — anti mock-masks-real-bug per feedback memory.
  //
  // The popup MUST persist through map pan/zoom interactions; Mapbox
  // pan starts with a mousedown on the canvas. Without an explicit
  // `.mapboxgl-canvas` exemption in our outside-click handler, ANY map
  // pan dismisses the popup — defeating the whole point of the
  // Mapbox-native Popup migration.
  describe('outside-click handler (cycle 3/2 canvas exemption)', () => {
    it('does NOT close the popup when the mousedown lands on the Mapbox canvas (pan)', () => {
      const onClose = vi.fn();
      renderPanel({ onClose });
      // Fabricate a canvas-classed element that the handler will see via
      // `closest('.mapboxgl-canvas')`. In production Mapbox renders this
      // node inside the map container; jsdom doesn't boot Mapbox so we
      // simulate the DOM shape.
      const canvas = document.createElement('canvas');
      canvas.className = 'mapboxgl-canvas';
      document.body.appendChild(canvas);
      try {
        fireEvent.mouseDown(canvas);
        expect(onClose).not.toHaveBeenCalled();
      } finally {
        canvas.remove();
      }
    });

    it('DOES close the popup when the mousedown lands outside the map (e.g. side panel)', () => {
      const onClose = vi.fn();
      renderPanel({ onClose });
      // A plain div outside the panel and not carrying any of the
      // exempted classes (`map-marker`, `mapboxgl-canvas`) should trigger
      // the close — this is the "click outside the map dismisses the
      // popup" affordance.
      const outside = document.createElement('div');
      outside.setAttribute('data-testid', 'outside-map');
      document.body.appendChild(outside);
      try {
        fireEvent.mouseDown(outside);
        expect(onClose).toHaveBeenCalled();
      } finally {
        outside.remove();
      }
    });

    it('does NOT close the popup when the mousedown lands on another map marker', () => {
      // Mirror of the pre-existing carve-out: clicking a DIFFERENT marker
      // swaps the popup content (handled by the page), it doesn't close
      // the popup outright.
      const onClose = vi.fn();
      renderPanel({ onClose });
      const marker = document.createElement('div');
      marker.setAttribute('data-testid', 'map-marker');
      document.body.appendChild(marker);
      try {
        fireEvent.mouseDown(marker);
        expect(onClose).not.toHaveBeenCalled();
      } finally {
        marker.remove();
      }
    });
  });
});
