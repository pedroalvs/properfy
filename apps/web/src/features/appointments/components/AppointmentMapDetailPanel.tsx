import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
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

/**
 * 025 §FR-451..460 — Right-anchored side panel that replaces the inline
 * `MapPopup` for appointments mode. The header + CLIENT + PROPERTIES are
 * available from the marker payload (no fetch); the 8 collapsible
 * sections fire `useAppointmentDetail(id)` on first expand and reuse the
 * react-query cache thereafter (lazy fetch — matches the
 * RelationsTab/feedback_new_tab_detail pattern from 023).
 */
export function AppointmentMapDetailPanel({
  appointment,
  open,
  onClose,
  onMoreDetails,
}: AppointmentMapDetailPanelProps) {
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set());
  const [shouldFetch, setShouldFetch] = useState(false);

  // Reset collapsibles + fetch flag whenever the appointment changes (clicking a
  // different marker swaps the panel content). Without this, opening a second
  // marker would keep the first marker's expanded sections.
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

  if (!appointment) return null;

  // CLIENT comes from the marker tenantName first (no fetch), with the lazily
  // hydrated `clientName` as authoritative once available.
  const clientName = detail?.clientName ?? appointment.tenantName ?? '—';

  return (
    <DrawerPanel open={open} onClose={onClose} size="narrow" ariaLabel={`Appointment ${appointment.code}`}>
      <div className="flex h-full flex-col" data-testid="appointment-map-detail-panel">
        {/* Header */}
        <div className="border-b border-border-subtle px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {appointment.serviceTypeName ?? 'Appointment'}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                {statusMeta && <StatusChip label={statusMeta.label} bg={statusMeta.bg} />}
                <span>{formatDate(appointment.scheduledDate)} {appointment.timeSlot}</span>
                <AppointmentCodePill code={appointment.code} />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
            >
              <i className="mdi mdi-close text-xl" />
            </button>
          </div>
        </div>

        {/* Always-expanded summary: CLIENT + PROPERTIES */}
        <div className="space-y-4 border-b border-border-subtle px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">Client</p>
            <p className="mt-1 text-sm text-text-primary" data-testid="map-detail-client">{clientName}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">Properties</p>
            <p className="mt-1 text-sm text-text-secondary">{appointment.propertyAddress}</p>
          </div>
        </div>

        {/* Collapsible sections */}
        <div className="flex-1 overflow-y-auto">
          {SECTIONS.map((section) => {
            const isExpanded = expanded.has(section.key);
            return (
              <div key={section.key} className="border-b border-border-subtle">
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-gray-50"
                  aria-expanded={isExpanded}
                  data-testid={`map-detail-section-${section.key}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    <i className={`mdi ${section.icon} text-base text-text-muted`} />
                    {section.label}
                  </span>
                  <i className={`mdi ${isExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'} text-text-muted`} />
                </button>
                {isExpanded && (
                  <div className="px-5 pb-4 pt-1 text-sm text-text-secondary">
                    {renderSectionContent(section.key, { detail, marker: appointment, isLoading, isError })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer CTA — "MORE DETAILS" opens the full appointment page in a new tab */}
        <div className="border-t border-border-subtle px-5 py-3">
          <button
            type="button"
            onClick={() => (onMoreDetails ?? defaultMoreDetails)(appointment.id)}
            className="w-full rounded border border-real-estate px-4 py-2 text-sm font-semibold text-real-estate hover:bg-real-estate/5"
            data-testid="map-detail-more-details"
          >
            MORE DETAILS
          </button>
        </div>
      </div>
    </DrawerPanel>
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
        <div className="space-y-2">
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
        <ul className="space-y-1">
          {detail.contacts!.map((c) => (
            <li key={c.id ?? c.contactId ?? c.snapshotName}>
              <span className="text-text-muted">{c.role}:</span> {c.snapshotName}
              {c.snapshotPhone && ` · ${c.snapshotPhone}`}
            </li>
          ))}
        </ul>
      );
    case 'service':
      return (
        <p>
          {marker.serviceTypeName ?? detail?.serviceTypeName ?? '—'}
        </p>
      );
    case 'restrictions':
      if (!detail || (detail.restrictions ?? []).length === 0) {
        return <p className="text-text-muted">No restrictions on file.</p>;
      }
      return (
        <ul className="space-y-1">
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
      // Lightweight summary — full timeline lives on the detail page.
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
