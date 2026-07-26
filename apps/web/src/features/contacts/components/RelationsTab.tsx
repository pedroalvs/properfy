import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useContactRelations } from '../hooks/useContactRelations';
import type { ContactAppointmentItem, ContactPropertyAggregate } from '../types';

interface RelationsTabProps {
  contactId: string;
  /** Lazy fetch — caller passes `tab === 'relations'`. */
  enabled?: boolean;
}

interface PropertyGroup extends ContactPropertyAggregate {
  appointments: ContactAppointmentItem[];
}

const STORAGE_KEY = 'contact-relations';

function readExpandState(contactId: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_KEY}:${contactId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeExpandState(contactId: string, state: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${STORAGE_KEY}:${contactId}`, JSON.stringify(state));
  } catch {
    // Storage quota exceeded or unavailable — ignore; the UI degrades to
    // resetting expand state on remount, which is acceptable.
  }
}

const ACTIVE_STATUSES = new Set<string>([
  'DRAFT',
  'AWAITING_INSPECTOR',
  'SCHEDULED',
  'DONE',
]);

function isActive(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

function summarise(appointments: ContactAppointmentItem[]): { total: number; pending: number } {
  let pending = 0;
  for (const a of appointments) {
    // PENDING here = scheduled but no tenant confirmation yet. We don't have
    // the per-appointment confirmation status in the contact-relations
    // payload (it lives on the appointment row). Treat AWAITING_INSPECTOR +
    // SCHEDULED as the working set for the chip.
    if (isActive(a.status) && a.status !== 'DONE') pending += 1;
  }
  return { total: appointments.length, pending };
}

export function RelationsTab({ contactId, enabled }: RelationsTabProps) {
  const navigate = useNavigate();
  const { properties, appointments, isLoading, isError, errorMessage, refetch } =
    useContactRelations(contactId, { enabled });
  const [expandState, setExpandState] = useState<Record<string, boolean>>(() => readExpandState(contactId));

  const groups = useMemo<PropertyGroup[]>(() => {
    const byPropertyId = new Map<string, ContactPropertyAggregate>();
    for (const p of properties) byPropertyId.set(p.propertyId, p);
    const apptsByPropertyId = new Map<string, ContactAppointmentItem[]>();
    for (const a of appointments) {
      const arr = apptsByPropertyId.get(a.propertyId) ?? [];
      arr.push(a);
      apptsByPropertyId.set(a.propertyId, arr);
    }
    return properties.map((p) => ({
      ...p,
      appointments: apptsByPropertyId.get(p.propertyId) ?? [],
    }));
  }, [properties, appointments]);

  const toggle = useCallback(
    (propertyId: string) => {
      setExpandState((prev) => {
        const next = { ...prev, [propertyId]: !prev[propertyId] };
        writeExpandState(contactId, next);
        return next;
      });
    },
    [contactId],
  );

  if (isLoading) return <LoadingState rows={4} />;
  if (isError) return <ErrorState message={errorMessage ?? 'Failed to load relations'} onRetry={refetch} />;

  if (groups.length === 0) {
    return (
      <EmptyState
        title="No properties yet"
        description="This contact has not been linked to any appointment yet."
        icon="mdi-home-outline"
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-default">
      {groups.map((g) => {
        const expanded = !!expandState[g.propertyId];
        const summary = summarise(g.appointments);
        return (
          <li key={g.propertyId} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => toggle(g.propertyId)}
                className="flex flex-1 items-center gap-3 text-left"
                aria-expanded={expanded}
                aria-controls={`relations-${g.propertyId}`}
              >
                <i
                  className={`mdi ${expanded ? 'mdi-chevron-down' : 'mdi-chevron-right'} text-lg text-text-secondary`}
                  aria-hidden="true"
                />
                <div className="flex flex-col">
                  <span className="font-semibold">{g.propertyCode}</span>
                  <span className="text-sm text-text-secondary">{g.street}, {g.suburb}</span>
                </div>
                {g.isPrimaryInActiveAppointment ? (
                  <span
                    className="ml-2 inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5"
                    style={{ backgroundColor: 'var(--color-status-scheduled)', color: 'var(--color-text-primary)' }}
                  >
                    PRIMARY
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-text-secondary">
                  {summary.total} {summary.total === 1 ? 'appt' : 'appts'} · {summary.pending} pending
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate(`/properties/${g.propertyId}`)}
                aria-label="Open property"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-black/5"
              >
                <i className="mdi mdi-eye-outline text-lg" aria-hidden="true" />
              </button>
            </div>
            {expanded ? (
              <ul id={`relations-${g.propertyId}`} className="mt-2 ml-7 flex flex-col gap-1 text-sm">
                {g.appointments.length === 0 ? (
                  <li className="text-text-secondary">No appointments visible for this property.</li>
                ) : (
                  g.appointments.map((a) => (
                    <li key={a.appointmentId} className="flex items-center gap-3">
                      <Link
                        className="text-primary hover:underline"
                        to={`/appointments/${a.appointmentId}`}
                      >
                        #{a.appointmentNumber}
                      </Link>
                      <span className="text-text-secondary">{a.status}</span>
                      <span className="text-text-secondary">{a.role}</span>
                      {a.isPrimary ? <span className="text-xs font-semibold text-success">primary</span> : null}
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

