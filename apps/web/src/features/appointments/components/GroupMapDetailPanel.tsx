import { useEffect, useMemo, useRef } from 'react';
import { StatusChip } from '@/components/ui/StatusChip';
import { SERVICE_GROUP_STATUS_MAP } from '@/lib/status-colors';
import { formatDate } from '@/lib/format-date';
import { ServiceGroupStatus } from '@properfy/shared';

interface GroupPreviewAppointment {
  timeSlotStart?: string | null;
  timeSlotEnd?: string | null;
}

interface GroupMapDetailPanelProps {
  group: {
    id: string;
    name: string | null;
    status: ServiceGroupStatus;
    groupSize: number;
    scheduledDate: string;
  } | null;
  /**
   * The group's appointments (fetched by the page via
   * GET /v1/appointments?serviceGroupId=…) — source of the time range shown
   * in the header. Undefined/empty simply omits the range.
   */
  appointments?: GroupPreviewAppointment[];
  isLoadingAppointments?: boolean;
  onClose: () => void;
  /** Publishes the group (DRAFT only — the button is disabled otherwise). */
  onPublish: () => void;
  isPublishing?: boolean;
}

/**
 * Content for the floating Mapbox Popup anchored to a clicked GROUP pin in
 * Groups mode. Mirrors the AppointmentMapDetailPanel popup pattern: the page
 * mounts this inside a native `mapboxgl.Popup` via `createPortal`, so Mapbox
 * owns positioning. Single click on a group pin previews the group here
 * WITHOUT entering the drill-down; the drill-down stays on double-click.
 */
export function GroupMapDetailPanel({
  group,
  appointments,
  isLoadingAppointments = false,
  onClose,
  onPublish,
  isPublishing = false,
}: GroupMapDetailPanelProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Dialog focus management: move focus into the card on open and restore it
  // to the previously focused element (the pin button) on unmount/close.
  useEffect(() => {
    if (!group) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.focus();
    return () => {
      previous?.focus?.();
    };
  }, [group?.id]);

  // ESC closes the popup.
  useEffect(() => {
    if (!group) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [group, onClose]);

  // Click outside closes — same exemptions as the appointment popup:
  // marker clicks swap the preview instead of closing first, and canvas
  // mousedown (pan/zoom) must not dismiss the popup.
  useEffect(() => {
    if (!group) return;
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
  }, [group, onClose]);

  const statusMeta = useMemo(
    () => (group ? SERVICE_GROUP_STATUS_MAP[group.status] : null),
    [group],
  );

  // Time range across the group's appointments. Bare HH:mm strings compare
  // lexicographically, so min/max give the earliest start / latest end.
  const timeRange = useMemo(() => {
    const starts = (appointments ?? []).map((a) => a.timeSlotStart).filter(Boolean) as string[];
    const ends = (appointments ?? []).map((a) => a.timeSlotEnd).filter(Boolean) as string[];
    if (starts.length === 0 || ends.length === 0) return null;
    return `${starts.reduce((m, v) => (v < m ? v : m))} - ${ends.reduce((m, v) => (v > m ? v : m))}`;
  }, [appointments]);

  if (!group) return null;

  const isDraft = group.status === ServiceGroupStatus.DRAFT;

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      className="flex w-[min(300px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg bg-card-bg shadow-xl outline-none"
      data-testid="group-map-detail-panel"
      role="dialog"
      aria-label={`Service group ${group.name ?? group.id}`}
    >
      {/* Header — same pattern as the appointment popup: title, status chip,
          date + time range (derived from the group's appointments). */}
      <div className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-text-primary">
              {group.name ?? 'Service group'}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              {statusMeta && <StatusChip label={statusMeta.label} bg={statusMeta.bg} />}
              <span data-testid="group-map-detail-when">
                {formatDate(group.scheduledDate)}
                {isLoadingAppointments && ' …'}
                {!isLoadingAppointments && timeRange && ` ${timeRange}`}
              </span>
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

      {/* Summary */}
      <div className="border-b border-border-subtle px-4 py-3">
        <p className="text-[10px] uppercase tracking-wide text-text-muted">Appointments</p>
        <p className="text-sm text-text-primary" data-testid="group-map-detail-size">
          {group.groupSize} appointment{group.groupSize === 1 ? '' : 's'}
        </p>
      </div>

      {/* Footer — VIEW GROUP opens the full detail page in a new tab;
          PUBLISH is the DRAFT-only action (backend re-validates). */}
      <div className="flex gap-2 px-4 py-2">
        <button
          type="button"
          onClick={() => window.open(`/service-groups/${group.id}`, '_blank')}
          className="flex-1 rounded border border-real-estate px-3 py-1.5 text-xs font-semibold text-real-estate hover:bg-real-estate/5"
          data-testid="group-map-detail-view"
        >
          VIEW GROUP
        </button>
        <span
          className="flex-1"
          title={isDraft ? undefined : 'Only draft groups can be published'}
        >
          <button
            type="button"
            onClick={onPublish}
            disabled={!isDraft || isPublishing}
            className="w-full rounded bg-real-estate px-3 py-1.5 text-xs font-semibold text-white hover:bg-real-estate/90 disabled:cursor-not-allowed disabled:bg-real-estate/40"
            data-testid="group-map-detail-publish"
          >
            {isPublishing ? 'PUBLISHING…' : 'PUBLISH'}
          </button>
        </span>
      </div>
    </div>
  );
}
