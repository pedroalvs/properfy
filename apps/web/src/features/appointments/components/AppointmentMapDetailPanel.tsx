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
  onClose: () => void;
  /** "MORE DETAILS" CTA target — defaults to opening the detail page in a new tab. */
  onMoreDetails?: (id: string) => void;
}

type SectionKey =
  | 'confirmation'
  | 'meeting'
  | 'contacts'
  | 'apps'
  | 'service'
  | 'restrictions'
  | 'notes'
  | 'observation'
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
  { key: 'apps', icon: 'mdi-apps', label: 'Apps' },
  { key: 'service', icon: 'mdi-clipboard-text', label: 'Service type' },
  { key: 'restrictions', icon: 'mdi-alert-octagon-outline', label: 'Restrictions' },
  { key: 'notes', icon: 'mdi-note-text-outline', label: 'Notes' },
  { key: 'observation', icon: 'mdi-text-box-outline', label: 'Observation' },
  { key: 'history', icon: 'mdi-history', label: 'History' },
  { key: 'financials', icon: 'mdi-cash', label: 'Financials' },
];

/**
 * 025 §FR-451..460 — Content for the floating Mapbox Popup anchored to
 * the clicked marker.
 *
 * **025 cycle 2/2 redesign:** this component now renders ONLY the popup
 * content. Positioning + viewport clamping + flip direction + per-frame
 * follow-on-pan logic are gone — `AppointmentMapPage` mounts the
 * content inside a native `mapboxgl.Popup` via `createPortal`, which
 * lets Mapbox handle the CSS transforms per render frame natively. The
 * popup always anchors at `setLngLat([lng, lat])` so it follows the
 * marker through pan / zoom / fitBounds without any React state change
 * — fixing the "popup not anchored to marker" smoke regression and
 * eliminating the ~80-line clampAnchor/flipAbove drift surface.
 */
export function AppointmentMapDetailPanel({
  appointment,
  onClose,
  onMoreDetails,
}: AppointmentMapDetailPanelProps) {
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set());
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Reset collapsibles whenever the appointment changes
  // (clicking a different marker swaps the popup content).
  useEffect(() => {
    setExpanded(new Set());
  }, [appointment?.id]);

  // ESC closes the popup.
  useEffect(() => {
    if (!appointment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [appointment, onClose]);

  // Click outside the popup closes it. Three exemptions:
  //  1. Marker clicks (`[data-testid="map-marker"]`) — let the page swap
  //     popup content for the new marker instead of closing first.
  //  2. Map canvas pan/zoom (`.mapboxgl-canvas`) — Mapbox emits a
  //     mousedown on the canvas to start a drag-pan; without this
  //     exemption the operator can't pan/zoom the map without losing the
  //     popup, and the whole point of the Mapbox-native Popup is that it
  //     STAYS anchored through map movement (cycle 3/2 fix per QA smoke).
  //  3. Anything inside the card itself (handled by the `contains` check).
  useEffect(() => {
    if (!appointment) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!cardRef.current) return;
      if (e.target instanceof Node && cardRef.current.contains(e.target)) return;
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('[data-testid="map-marker"]')) return;
      if (targetEl?.closest('.mapboxgl-canvas')) return;
      onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [appointment, onClose]);

  // Eager fetch on pin click: detail loads immediately so expanding any section
  // is instant instead of waiting for a lazy trigger. useAppointmentDetail is a
  // single-aggregator hook; React Query caches the result so multiple expands
  // never cause additional network requests.
  const { appointment: detail, isLoading, isError } = useAppointmentDetail(appointment?.id ?? null);

  const toggleSection = (key: SectionKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const statusMeta = useMemo(() => {
    if (!appointment) return null;
    return APPOINTMENT_STATUS_MAP[appointment.status as AppointmentStatus];
  }, [appointment]);

  if (!appointment) return null;

  // CLIENT comes from the marker clientName (no fetch), with the detail's clientName as authoritative once available.
  const clientName = detail?.clientName ?? appointment.clientName ?? '—';

  return (
    <div
      ref={cardRef}
      className="flex w-[340px] flex-col overflow-hidden rounded-lg bg-card-bg shadow-xl"
      style={{ maxHeight: '70vh' }}
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

      {/* T-C5-5 — REJECTED banner: shown at top when appointment is rejected */}
      {appointment.status === 'REJECTED' && (
        <div
          className="flex items-start gap-2 border-b border-red-200 border-l-4 border-l-red-500 bg-red-50 px-3 py-2"
          data-testid="map-detail-rejected-banner"
        >
          <i className="mdi mdi-cancel mt-0.5 flex-shrink-0 text-sm text-red-500" />
          <div className="min-w-0 text-sm text-red-900">
            <p className="font-medium">Rejected</p>
            {(detail?.rejectionReasonCode ?? appointment.rejectionReasonCode) && (
              <span className="mr-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-red-700">
                {detail?.rejectionReasonCode ?? appointment.rejectionReasonCode}
              </span>
            )}
            {(detail?.reason ?? appointment.reason) && (
              <p className="mt-0.5 text-xs text-red-800">{detail?.reason ?? appointment.reason}</p>
            )}
          </div>
        </div>
      )}

      {/* Always-expanded summary: CLIENT + PROPERTIES */}
      <div className="space-y-2 border-b border-border-subtle px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-muted">Agency</p>
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
            rentalTenantConfirmationStatus={detail?.rentalTenantConfirmationStatus ?? marker.rentalTenantConfirmationStatus}
            hasEmail={!!(detail?.contactEmail ?? marker.contactEmail)}
            hasSms={!!(detail?.contactPhone ?? marker.contactPhone)}
          />
          <span>{detail?.rentalTenantConfirmationStatus ?? marker.rentalTenantConfirmationStatus ?? 'PENDING'}</span>
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
    case 'apps':
      if (!detail) return <p className="text-text-muted">No apps loaded.</p>;
      if ((detail.apps ?? []).length === 0) {
        return <p className="text-text-muted">No apps linked.</p>;
      }
      return (
        <ul className="space-y-1.5">
          {detail.apps!.map((a) => (
            <li key={a.id}>
              <span className="font-semibold">{a.name}</span>
              <div className="text-text-muted">
                <span className="font-mono">{a.username}</span>
                {' · '}
                <span className="font-mono">{a.password}</span>
              </div>
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
    case 'observation':
      return detail?.observation
        ? <p className="whitespace-pre-wrap">{detail.observation}</p>
        : <p className="text-text-muted">No observation.</p>;
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
