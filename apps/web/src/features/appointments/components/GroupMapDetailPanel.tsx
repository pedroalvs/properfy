import { useEffect, useMemo, useRef } from 'react';
import { StatusChip } from '@/components/ui/StatusChip';
import { SERVICE_GROUP_STATUS_MAP } from '@/lib/status-colors';
import { formatDate } from '@/lib/format-date';
import type { ServiceGroupStatus } from '@properfy/shared';

interface GroupMapDetailPanelProps {
  group: {
    id: string;
    name: string | null;
    status: ServiceGroupStatus;
    groupSize: number;
    scheduledDate: string;
  } | null;
  onClose: () => void;
  /** Same drill-down the double-click gesture triggers (hide group pins, show the group's appointments + table modal). */
  onOpenGroup: () => void;
}

/**
 * Content for the floating Mapbox Popup anchored to a clicked GROUP pin in
 * Groups mode. Mirrors the AppointmentMapDetailPanel popup pattern: the page
 * mounts this inside a native `mapboxgl.Popup` via `createPortal`, so Mapbox
 * owns positioning. Single click on a group pin previews the group here
 * WITHOUT entering the drill-down; the drill-down stays on double-click (or
 * the OPEN GROUP button below).
 *
 * No fetch — everything shown already rides on the group map pin.
 */
export function GroupMapDetailPanel({ group, onClose, onOpenGroup }: GroupMapDetailPanelProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

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

  if (!group) return null;

  return (
    <div
      ref={cardRef}
      className="flex w-[300px] flex-col overflow-hidden rounded-lg bg-card-bg shadow-xl"
      data-testid="group-map-detail-panel"
      role="dialog"
      aria-label={`Service group ${group.name ?? group.id}`}
    >
      {/* Header */}
      <div className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-text-primary">
              {group.name ?? 'Service group'}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              {statusMeta && <StatusChip label={statusMeta.label} bg={statusMeta.bg} />}
              <span>{formatDate(group.scheduledDate)}</span>
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

      {/* Footer CTA — enters the drill-down (same as double-clicking the pin) */}
      <div className="px-4 py-2">
        <button
          type="button"
          onClick={onOpenGroup}
          className="w-full rounded border border-real-estate px-3 py-1.5 text-xs font-semibold text-real-estate hover:bg-real-estate/5"
          data-testid="group-map-detail-open"
        >
          OPEN GROUP
        </button>
      </div>
    </div>
  );
}
