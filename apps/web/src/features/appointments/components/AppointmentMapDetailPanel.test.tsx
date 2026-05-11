/**
 * AppointmentMapDetailPanel (025 §FR-451..460) — pins the three core
 * behaviours called out by the plan:
 *  1. CLIENT + PROPERTIES render from the marker payload without fetching.
 *  2. All 8 collapsibles start CLOSED — first expand triggers the lazy
 *     detail fetch (`useAppointmentDetail` called with the id, not null).
 *  3. Clicking a DIFFERENT marker resets the collapsibles and re-fetches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  // 025 round-2 — edge clamping + flip direction.
  //
  // The popup width is 340 and height ~450. On a 1280x800 viewport the
  // fully-safe zones are:
  //   - flip-below: anchor.y ∈ [16, 316]   (popup occupies [y+18, y+468])
  //   - flip-above: anchor.y ∈ [484, 784]  (popup occupies [y-468, y])
  // For anchor in the "gap" (316, 484), `clampAnchor` picks the side
  // with more room and clamps Y to that side's bound.
  describe('viewport-edge clamping + flip direction', () => {
    const VW = 1280;
    const VH = 800;
    const POPUP_HALF_W = 170;
    const POPUP_HEIGHT = 450;
    const POPUP_OFFSET = 18;
    const MARGIN = 16;

    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: VW });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: VH });
    });

    const POPUP_WIDTH_PX = POPUP_HALF_W * 2;
    const POPUP_WIDTH_HALF = POPUP_HALF_W;

    /**
     * Resolves the effective on-screen rect from the popup's inline
     * style. jsdom doesn't lay out elements (`getBoundingClientRect`
     * returns all zeros), so we read `style.top/left/transform` and
     * compute the resulting bounding box manually. This is the test
     * the QA asked for — it pins the VISUAL OUTPUT, not just the
     * helper's internal coordinates, so the previous "tests passed
     * but the bug visual passes" anti-pattern can't recur.
     */
    function readEffectiveRect(popup: HTMLElement) {
      const top = parseFloat(popup.style.top);
      const left = parseFloat(popup.style.left);
      const flipAbove = popup.style.transform.includes('-100%');
      const effectiveTop = flipAbove ? top - POPUP_HEIGHT - POPUP_OFFSET : top + POPUP_OFFSET;
      const effectiveLeft = left - POPUP_WIDTH_HALF;
      return {
        top: effectiveTop,
        bottom: effectiveTop + POPUP_HEIGHT,
        left: effectiveLeft,
        right: effectiveLeft + POPUP_WIDTH_PX,
      };
    }

    it('clamps to the LEFT viewport edge when anchor.x is off-screen (negative)', () => {
      renderPanel({ anchor: { x: -66, y: 200 } });
      const panel = screen.getByTestId('appointment-map-detail-panel');
      const left = parseFloat(panel.style.left);
      expect(left).toBeGreaterThanOrEqual(POPUP_HALF_W + MARGIN);
    });

    it('clamps to the RIGHT viewport edge when anchor.x exceeds viewport width', () => {
      renderPanel({ anchor: { x: VW + 100, y: 200 } });
      const panel = screen.getByTestId('appointment-map-detail-panel');
      const left = parseFloat(panel.style.left);
      expect(left).toBeLessThanOrEqual(VW - POPUP_HALF_W - MARGIN);
    });

    it('flips below when anchor.y is in the top safe zone (1 ≤ y ≤ 316)', () => {
      renderPanel({ anchor: { x: 400, y: 200 } });
      const panel = screen.getByTestId('appointment-map-detail-panel');
      expect(panel.style.transform).not.toContain('-100%');
    });

    it('flips above when anchor.y is in the bottom safe zone (484 ≤ y ≤ 784)', () => {
      renderPanel({ anchor: { x: 400, y: 600 } });
      const panel = screen.getByTestId('appointment-map-detail-panel');
      expect(panel.style.transform).toContain('-100%');
    });

    it('clamps top-edge anchor (Sydney y=-163) into below-flip range', () => {
      renderPanel({ anchor: { x: 400, y: -163 } });
      const panel = screen.getByTestId('appointment-map-detail-panel');
      const top = parseFloat(panel.style.top);
      expect(top).toBeGreaterThanOrEqual(MARGIN);
      expect(panel.style.transform).not.toContain('-100%');
    });

    it('clamps bottom-edge anchor (y > vh) into above-flip range', () => {
      renderPanel({ anchor: { x: 400, y: VH + 100 } });
      const panel = screen.getByTestId('appointment-map-detail-panel');
      const top = parseFloat(panel.style.top);
      expect(top).toBeLessThanOrEqual(VH - MARGIN);
      expect(panel.style.transform).toContain('-100%');
    });

    it('does NOT modify an anchor that already sits comfortably in a safe zone', () => {
      // y=200 is well inside the below-flip safe range [16, 316].
      renderPanel({ anchor: { x: 640, y: 200 } });
      const panel = screen.getByTestId('appointment-map-detail-panel');
      expect(parseFloat(panel.style.left)).toBe(640);
      expect(parseFloat(panel.style.top)).toBe(200);
    });

    // 025 round-2 re-fix — Anti mock-masks-real-bug per feedback memory.
    // Asserts the VISUAL bounding box (post-transform) for a swath of
    // anchor.y values, including the "gap" range (316, 484) where the
    // previous fix's static `> 260` threshold clipped the popup.
    it('popup VISUAL bounding box stays inside the viewport at any anchor.y', () => {
      const samples = [-200, 0, 50, 200, 280, 320, 400, 460, 500, 600, 700, VH, VH + 200];
      for (const y of samples) {
        const { unmount } = renderPanel({ anchor: { x: 640, y } });
        const panel = screen.getByTestId('appointment-map-detail-panel');
        const rect = readEffectiveRect(panel);
        expect(rect.top, `anchor.y=${y}: popup top must be inside viewport`).toBeGreaterThanOrEqual(MARGIN - 1);
        expect(rect.bottom, `anchor.y=${y}: popup bottom must be inside viewport`).toBeLessThanOrEqual(VH - MARGIN + 1);
        expect(rect.left, `anchor.y=${y}: popup left must be inside viewport`).toBeGreaterThanOrEqual(MARGIN - 1);
        expect(rect.right, `anchor.y=${y}: popup right must be inside viewport`).toBeLessThanOrEqual(VW - MARGIN + 1);
        unmount();
      }
    });

    it('popup VISUAL bounding box stays inside the viewport at any anchor.x', () => {
      const samples = [-300, -50, 0, 200, 640, 1000, VW, VW + 200];
      for (const x of samples) {
        const { unmount } = renderPanel({ anchor: { x, y: 200 } });
        const panel = screen.getByTestId('appointment-map-detail-panel');
        const rect = readEffectiveRect(panel);
        expect(rect.left, `anchor.x=${x}: popup left must be inside viewport`).toBeGreaterThanOrEqual(MARGIN - 1);
        expect(rect.right, `anchor.x=${x}: popup right must be inside viewport`).toBeLessThanOrEqual(VW - MARGIN + 1);
        unmount();
      }
    });

    it('reproduces the QA-reported regression case (anchor.y=280) and renders fully visible', () => {
      // Pre-fix: `safeAnchor.y > 260` → flipped above → top = 280 - 444 = -164 (clipped).
      // Post-fix: anchor.y=280 ≤ 316 fits below → flip-below at y=280 → top = 298, bottom = 748.
      renderPanel({ anchor: { x: 640, y: 280 } });
      const panel = screen.getByTestId('appointment-map-detail-panel');
      expect(panel.style.transform).not.toContain('-100%');
      const rect = readEffectiveRect(panel);
      expect(rect.top).toBeGreaterThanOrEqual(MARGIN);
      expect(rect.bottom).toBeLessThanOrEqual(VH - MARGIN);
    });
  });
});
