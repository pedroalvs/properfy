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

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppointmentMapDetailPanel } from './AppointmentMapDetailPanel';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

// Capture the id passed to useAppointmentDetail so we can assert lazy fetch.
const detailIdSpy = vi.fn();
// Mutable detail returned by the mocked hook (default null = not loaded yet).
let mockDetail: Record<string, unknown> | null = null;

vi.mock('../hooks/useAppointmentDetail', () => ({
  useAppointmentDetail: (id: string | null) => {
    detailIdSpy(id);
    return { appointment: mockDetail, isLoading: false, isError: false, refetch: vi.fn() };
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
  afterEach(() => {
    mockDetail = null;
  });

  it('shows custom fields in the Custom fields section once detail loads', () => {
    mockDetail = {
      customFields: [
        { label: 'Gate code', value: '1234' },
        { label: 'Parking', value: 'Level 2' },
      ],
    };
    renderPanel();
    fireEvent.click(screen.getByTestId('map-detail-section-customFields'));
    expect(screen.getByText('Gate code:')).toBeInTheDocument();
    expect(screen.getByText(/1234/)).toBeInTheDocument();
    expect(screen.getByText('Parking:')).toBeInTheDocument();
  });

  it('renders all app credential fields in the Apps section', () => {
    mockDetail = {
      apps: [{
        id: 'app-1', name: 'Airbnb', username: 'host', password: 'secret',
        needsAuthCode: true,
        appUrl: 'https://example.com/app', instructionsUrl: 'https://example.com/docs',
        instructionsPassword: 'doc-pass',
      }],
    };
    renderPanel();
    fireEvent.click(screen.getByTestId('map-detail-section-apps'));
    expect(screen.getByText('Airbnb')).toBeInTheDocument();
    expect(screen.getByText('host')).toBeInTheDocument();
    // The code itself is never stored — only the warning that one is needed.
    expect(screen.getByText('Requires authentication code')).toBeInTheDocument();
    const openApp = screen.getByRole('link', { name: /open app/i });
    expect(openApp).toHaveAttribute('href', 'https://example.com/app');
    expect(openApp).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /instructions/i })).toHaveAttribute('href', 'https://example.com/docs');
    expect(screen.getByLabelText('instructions password')).toBeInTheDocument();
  });

  it('omits optional app fields when absent', () => {
    mockDetail = {
      apps: [{
        id: 'app-1', name: 'Legacy', username: 'u', password: 'p',
        needsAuthCode: false, appUrl: null, instructionsUrl: null, instructionsPassword: null,
      }],
    };
    renderPanel();
    fireEvent.click(screen.getByTestId('map-detail-section-apps'));
    expect(screen.getByText('Legacy')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open app/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Requires authentication code')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('instructions password')).not.toBeInTheDocument();
  });

  it('shows an empty state in the Custom fields section when there are none', () => {
    mockDetail = { customFields: [] };
    renderPanel();
    fireEvent.click(screen.getByTestId('map-detail-section-customFields'));
    expect(screen.getByText('No custom fields.')).toBeInTheDocument();
  });

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

  it('MORE DETAILS CTA calls the onMoreDetails override', () => {
    const onMoreDetails = vi.fn();
    renderPanel({ onMoreDetails });
    fireEvent.click(screen.getByTestId('map-detail-more-details'));
    expect(onMoreDetails).toHaveBeenCalledWith(sampleAppointment.id);
  });

  it('MORE DETAILS CTA navigates to the appointment detail in the same tab by default', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/appointments/map']}>
          <Routes>
            <Route
              path="/appointments/map"
              element={<AppointmentMapDetailPanel appointment={sampleAppointment} onClose={vi.fn()} />}
            />
            <Route path="/appointments/:id" element={<div data-testid="detail-probe" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId('map-detail-more-details'));
    expect(screen.getByTestId('detail-probe')).toBeInTheDocument();
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

  /**
   * The rental tenant's weekly availability is the most actionable thing on a
   * declined appointment, so it outranks the operator's access restriction in
   * the pin. It also fixes an active lie: the portal writes `isHome: false` on
   * decline, so the old rendering announced "Property vacant" for exactly the
   * appointments that carried availability.
   */
  describe('Restrictions & availability section', () => {
    const openSection = () =>
      fireEvent.click(screen.getByTestId('map-detail-section-restrictions'));

    it('shows the tenant availability instead of the misleading vacancy line', () => {
      mockDetail = {
        restrictions: [{
          id: 'r-1',
          isHome: false,
          notes: null,
          source: 'RENTAL_TENANT_PORTAL',
          availableSlotsJson: [
            { dayOfWeek: 'WED', start: '14:00', end: '17:00' },
            { dayOfWeek: 'MON', start: '09:00', end: '12:00' },
          ],
        }],
      };
      renderPanel();
      openSection();

      // Mon→Sun ordering, not the order the portal happened to emit.
      expect(screen.getByText('Mon 09:00 - 12:00')).toBeInTheDocument();
      expect(screen.getByText('Wed 14:00 - 17:00')).toBeInTheDocument();
      expect(screen.queryByText(/Property vacant/)).not.toBeInTheDocument();
    });

    it('picks the availability by content, never by row position', () => {
      // A decline leaves a single row; an operator edit can leave one whose
      // first entry has no slots. `restrictions[0]` would miss it.
      mockDetail = {
        restrictions: [
          { id: 'r-1', isHome: true, notes: 'Dog in backyard', source: 'OPERATOR', availableSlotsJson: null },
          { id: 'r-2', isHome: false, notes: null, source: 'RENTAL_TENANT_PORTAL', availableSlotsJson: [{ dayOfWeek: 'FRI', start: '08:00', end: '10:00' }] },
        ],
      };
      renderPanel();
      openSection();

      expect(screen.getByText('Fri 08:00 - 10:00')).toBeInTheDocument();
    });

    it('falls back to the operator restriction when there is no availability', () => {
      mockDetail = {
        restrictions: [{
          id: 'r-1', isHome: true, notes: 'Dog in backyard',
          source: 'OPERATOR', availableSlotsJson: null,
        }],
      };
      renderPanel();
      openSection();

      expect(screen.getByText(/Home occupied/)).toBeInTheDocument();
      expect(screen.getByText(/Dog in backyard/)).toBeInTheDocument();
    });

    it('treats an empty slot array as no availability', () => {
      mockDetail = {
        restrictions: [{
          id: 'r-1', isHome: false, notes: null,
          source: 'OPERATOR', availableSlotsJson: [],
        }],
      };
      renderPanel();
      openSection();

      expect(screen.getByText(/Property vacant/)).toBeInTheDocument();
    });

    it('shows the empty state when there is no restriction row at all', () => {
      mockDetail = { restrictions: [] };
      renderPanel();
      openSection();

      expect(screen.getByText('No restrictions on file.')).toBeInTheDocument();
    });
  });
});
