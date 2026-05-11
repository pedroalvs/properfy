import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { StatusChip } from '@/components/ui/StatusChip';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';
import { formatDate } from '@/lib/format-date';
import type { AppointmentStatus } from '@properfy/shared';
import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';
import { useAppointmentDetail } from '../hooks/useAppointmentDetail';
import { AppointmentCodePill } from './AppointmentCodePill';
import { ConfirmationChannelIcons } from './ConfirmationChannelIcons';

interface AppointmentMapDetailPanelProps {
  /** Marker that triggered the panel. Source of CLIENT / PROPERTIES (no fetch needed). */
  appointment: AppointmentMapItem | null;
  open: boolean;
  onClose: () => void;
  /** Screen-pixel coordinates of the anchored marker. The popup floats next to it. */
  anchor: { x: number; y: number } | null;
  /** "MORE DETAILS" CTA target — defaults to opening the detail page in a new tab. */
  onMoreDetails?: (id: string) => void;
}

type SectionKey =
  | 'confirmation'
  | 'meeting'
  | 'contacts'
  | 'service'
  | 'restrictions'
  | 'notes'
  | 'history'
  | 'financials';

interface SectionConfig {
  key: SectionKey;
  icon: string;
  label: string;
}

const SECTIONS: SectionConfig[] = [
  { key: 'confirmation', icon: 'mdi-cellphone-message', label: 'Tenant confirmation' },
  { key: 'meeting', icon: 'mdi-map-marker-radius', label: 'Meeting location' },
  { key: 'contacts', icon: 'mdi-account-multiple', label: 'Contacts' },
  { key: 'service', icon: 'mdi-clipboard-text', label: 'Service type' },
  { key: 'restrictions', icon: 'mdi-alert-octagon-outline', label: 'Restrictions' },
  { key: 'notes', icon: 'mdi-note-text-outline', label: 'Notes' },
  { key: 'history', icon: 'mdi-history', label: 'History' },
  { key: 'financials', icon: 'mdi-cash', label: 'Financials' },
];

const POPUP_WIDTH = 340;
const VIEWPORT_MARGIN = 16;

/**
 * 025 round-2 minor — keep the popup visible when the anchor marker sits
 * near a viewport edge (Melbourne x=-66, Sydney top y=-163).
 *
 * The popup is centered horizontally on `anchor.x` (CSS
 * `transform: translate(-50%)`), so the horizontal constraint clamps
 * `anchor.x` into `[POPUP_WIDTH/2 + MARGIN, vw - POPUP_WIDTH/2 - MARGIN]`.
 * That guarantees both popup edges stay inside the viewport regardless
 * of marker position.
 *
 * Vertically the popup auto-flips above/below at `anchor.y === 260`, so
 * we only need to keep `anchor.y` itself inside the viewport — the flip
 * picks the side with room. Clamping into `[MARGIN, vh - MARGIN]` is
 * enough; we don't try to predict the popup's expanded height because
 * the `max-height: 70vh` cap + internal scroll handle that case.
 *
 * When the marker sits FULLY off-screen, the popup hugs the nearest
 * edge — slight visual disconnect (popup not directly under marker),
 * but the operator sees the data they clicked for instead of an empty
 * map.
 */
function clampAnchor(
  anchor: { x: number; y: number },
  viewport: { width: number; height: number },
): { x: number; y: number } {
  const halfW = POPUP_WIDTH / 2;
  const minX = halfW + VIEWPORT_MARGIN;
  const maxX = viewport.width - halfW - VIEWPORT_MARGIN;
  // Pathological viewport narrower than the popup itself → center the
  // popup on the viewport midline and let the user scroll horizontally.
  const clampedX = maxX >= minX
    ? Math.max(minX, Math.min(anchor.x, maxX))
    : viewport.width / 2;

  const minY = VIEWPORT_MARGIN;
  const maxY = viewport.height - VIEWPORT_MARGIN;
  const clampedY = Math.max(minY, Math.min(anchor.y, maxY));

  return { x: clampedX, y: clampedY };
}

/**
 * 025 §FR-451..460 — Floating popup anchored to the clicked marker.
 *
 * **NOT a side drawer.** Previous round shipped a `DrawerPanel` variant
 * that the user rejected in smoke testing — the mockup calls for a
 * floating card next to the marker. This component:
 *
 *  - Positions itself absolutely on the map overlay using
 *    `mapInstance.project([lng, lat])` screen-pixel coords passed in as
 *    `anchor`. Mirrors the existing `MapPopup` precedent in this codebase.
 *  - Header + CLIENT + PROPERTIES render from the marker payload — no
 *    fetch on open.
 *  - 8 collapsible sections start closed. First expand triggers
 *    `useAppointmentDetail(id)`; subsequent expands hit the
 *    `react-query` cache. Marker-switch resets collapsed state.
 *  - Click-outside / ESC / X close (handled by the page; this panel
 *    just emits `onClose`).
 */
export function AppointmentMapDetailPanel({
  appointment,
  open,
  onClose,
  anchor,
  onMoreDetails,
}: AppointmentMapDetailPanelProps) {
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set());
  const [shouldFetch, setShouldFetch] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Reset collapsibles + fetch flag whenever the appointment changes
  // (clicking a different marker swaps the popup content).
  useEffect(() => {
    setExpanded(new Set());
    setShouldFetch(false);
  }, [appointment?.id]);

  // Closed → reset state so a future open starts collapsed.
  useEffect(() => {
    if (!open) {
      setExpanded(new Set());
      setShouldFetch(false);
    }
  }, [open]);

  // ESC closes the popup. Click-outside is handled by a separate listener
  // below — we only fire `onClose` for clicks that didn't hit the card.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!cardRef.current) return;
      if (e.target instanceof Node && cardRef.current.contains(e.target)) return;
      // Don't intercept clicks on Mapbox markers — they need to swap the
      // popup to their own appointment. Markers carry `data-testid="map-marker"`.
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('[data-testid="map-marker"]')) return;
      onClose();
    };
    // `mousedown` (not `click`) so the close fires before any other onClick
    // handler can swallow the event.
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, onClose]);

  const { appointment: detail, isLoading, isError } = useAppointmentDetail(shouldFetch && appointment ? appointment.id : null);

  const toggleSection = (key: SectionKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    // First expand → kick off the detail fetch.
    if (!shouldFetch) setShouldFetch(true);
  };

  const statusMeta = useMemo(() => {
    if (!appointment) return null;
    return APPOINTMENT_STATUS_MAP[appointment.status as AppointmentStatus];
  }, [appointment]);

  if (!appointment || !open || !anchor) return null;

  // CLIENT comes from the marker tenantName first (no fetch), with the lazily
  // hydrated `clientName` as authoritative once available.
  const clientName = detail?.clientName ?? appointment.tenantName ?? '—';

  // Clamp anchor into the viewport so the popup never clips at an edge.
  // Reads window.innerWidth/Height at render time — viewport is read on
  // every render so the popup repositions if the user resizes; ResizeObserver
  // would be slightly cleaner but overkill for a transient overlay.
  const viewport = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  };
  const safeAnchor = clampAnchor(anchor, viewport);

  // Position the popup near the marker. Default: above + centered.
  // When the marker sits near the top of the viewport, flip below so the
  // popup never disappears off-screen.
  const style: React.CSSProperties = {
    position: 'absolute',
    left: safeAnchor.x,
    top: safeAnchor.y,
    width: POPUP_WIDTH,
    maxHeight: '70vh',
    transform: safeAnchor.y > 260
      ? 'translate(-50%, calc(-100% - 18px))'
      : 'translate(-50%, 18px)',
  };

  return (
    <div
      ref={cardRef}
      className="absolute z-30 flex flex-col overflow-hidden rounded-lg bg-card-bg shadow-xl"
      style={style}
      data-testid="appointment-map-detail-panel"
      role="dialog"
      aria-label={`Appointment ${appointment.code}`}
    >
      {/* Header */}
      <div className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-text-primary">
              {appointment.serviceTypeName ?? 'Appointment'}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              {statusMeta && <StatusChip label={statusMeta.label} bg={statusMeta.bg} />}
              <span>{formatDate(appointment.scheduledDate)} {appointment.timeSlot}</span>
              <AppointmentCodePill code={appointment.code} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close popup"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
          >
            <i className="mdi mdi-close text-lg" />
          </button>
        </div>
      </div>

      {/* Always-expanded summary: CLIENT + PROPERTIES */}
      <div className="space-y-2 border-b border-border-subtle px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Client</p>
          <p className="text-sm text-text-primary" data-testid="map-detail-client">{clientName}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Properties</p>
          <p className="text-xs text-text-secondary">{appointment.propertyAddress}</p>
        </div>
      </div>

      {/* Collapsible sections — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {SECTIONS.map((section) => {
          const isExpanded = expanded.has(section.key);
          return (
            <div key={section.key} className="border-b border-border-subtle">
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-gray-50"
                aria-expanded={isExpanded}
                data-testid={`map-detail-section-${section.key}`}
              >
                <span className="flex items-center gap-2 text-xs font-medium text-text-primary">
                  <i className={`mdi ${section.icon} text-sm text-text-muted`} />
                  {section.label}
                </span>
                <i className={`mdi ${isExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'} text-text-muted`} />
              </button>
              {isExpanded && (
                <div className="px-4 pb-3 pt-1 text-xs text-text-secondary">
                  {renderSectionContent(section.key, { detail, marker: appointment, isLoading, isError })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer CTA — opens the full appointment page in a new tab */}
      <div className="border-t border-border-subtle px-4 py-2">
        <button
          type="button"
          onClick={() => (onMoreDetails ?? defaultMoreDetails)(appointment.id)}
          className="w-full rounded border border-real-estate px-3 py-1.5 text-xs font-semibold text-real-estate hover:bg-real-estate/5"
          data-testid="map-detail-more-details"
        >
          MORE DETAILS
        </button>
      </div>
    </div>
  );
}

function defaultMoreDetails(id: string) {
  window.open(`/appointments/${id}`, '_blank');
}

interface SectionCtx {
  detail: ReturnType<typeof useAppointmentDetail>['appointment'];
  marker: AppointmentMapItem;
  isLoading: boolean;
  isError: boolean;
}

function renderSectionContent(key: SectionKey, ctx: SectionCtx): ReactNode {
  if (ctx.isLoading) return <p className="text-text-muted">Loading…</p>;
  if (ctx.isError) return <p className="text-error">Failed to load details.</p>;

  const { detail, marker } = ctx;
  switch (key) {
    case 'confirmation':
      return (
        <div className="flex items-center gap-3">
          <ConfirmationChannelIcons
            tenantConfirmationStatus={detail?.tenantConfirmationStatus ?? marker.tenantConfirmationStatus}
            hasEmail={!!(detail?.contactEmail ?? marker.contactEmail)}
            hasSms={!!(detail?.contactPhone ?? marker.contactPhone)}
          />
          <span>{detail?.tenantConfirmationStatus ?? marker.tenantConfirmationStatus ?? 'PENDING'}</span>
        </div>
      );
    case 'meeting':
      return (
        <div className="space-y-1">
          {detail?.meetingLocation
            ? <p>{detail.meetingLocation}</p>
            : <p className="text-text-muted">No meeting location set.</p>}
          {detail?.keyLocation && (
            <p><span className="text-text-muted">Key:</span> {detail.keyLocation}</p>
          )}
        </div>
      );
    case 'contacts':
      if (!detail) return <p className="text-text-muted">No contacts loaded.</p>;
      if ((detail.contacts ?? []).length === 0) {
        return (
          <p>
            <span className="text-text-muted">Primary:</span>{' '}
            {detail.contactName} {detail.contactPhone ? `· ${detail.contactPhone}` : ''}
          </p>
        );
      }
      return (
        <ul className="space-y-0.5">
          {detail.contacts!.map((c) => (
            <li key={c.id ?? c.contactId ?? c.snapshotName}>
              <span className="text-text-muted">{c.role}:</span> {c.snapshotName}
              {c.snapshotPhone && ` · ${c.snapshotPhone}`}
            </li>
          ))}
        </ul>
      );
    case 'service':
      return <p>{marker.serviceTypeName ?? detail?.serviceTypeName ?? '—'}</p>;
    case 'restrictions':
      if (!detail || (detail.restrictions ?? []).length === 0) {
        return <p className="text-text-muted">No restrictions on file.</p>;
      }
      return (
        <ul className="space-y-0.5">
          {detail.restrictions!.map((r) => (
            <li key={r.id}>
              {r.isHome ? 'Home occupied' : 'Property vacant'}
              {r.notes && ` — ${r.notes}`}
            </li>
          ))}
        </ul>
      );
    case 'notes':
      return detail?.notes
        ? <p className="whitespace-pre-wrap">{detail.notes}</p>
        : <p className="text-text-muted">No notes.</p>;
    case 'history':
      return (
        <p>
          Created {detail?.createdAt ? formatDate(detail.createdAt) : '—'}
          {' · '}
          updated {detail?.updatedAt ? formatDate(detail.updatedAt) : '—'}
        </p>
      );
    case 'financials':
      return <p className="text-text-muted">Open MORE DETAILS for financial breakdown.</p>;
  }
}
