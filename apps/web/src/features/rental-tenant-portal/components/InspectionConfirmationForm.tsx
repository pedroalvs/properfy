import { useState } from 'react';
import type { AvailableSlot } from '@properfy/shared';
import { WeeklyAvailabilityPicker } from './WeeklyAvailabilityPicker';

interface InspectionConfirmationFormProps {
  onConfirm: (rentalTenantNote?: string) => Promise<void>;
  onUnavailable: (input: { rentalTenantNote: string; availableSlotsJson: AvailableSlot[] }) => Promise<void>;
  isSubmitting?: boolean;
  isReadOnly?: boolean;
  /**
   * Past the confirm cutoff: the Yes path is locked but the No (unavailability)
   * path stays fully functional, so No comes pre-selected.
   */
  confirmDisabled?: boolean;
}

type Selection = 'YES' | 'NO' | null;

function isSubmitEnabled(selection: Selection, note: string, slots: AvailableSlot[]): boolean {
  if (selection === null) return false;
  if (selection === 'YES') return true;
  // NO: note required + ≥1 slot
  return note.trim().length > 0 && slots.length > 0;
}

export function InspectionConfirmationForm({
  onConfirm,
  onUnavailable,
  isSubmitting,
  isReadOnly,
  confirmDisabled,
}: InspectionConfirmationFormProps) {
  const [selection, setSelection] = useState<Selection>(confirmDisabled ? 'NO' : null);
  const [note, setNote] = useState('');
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [done, setDone] = useState<'CONFIRMED' | 'UNAVAILABLE' | null>(null);

  if (done === 'CONFIRMED') {
    return (
      <div className="rounded-xl border border-border-subtle bg-card-bg p-6">
        <div className="flex items-center gap-3 text-success">
          <i className="mdi mdi-check-circle text-2xl" />
          <div>
            <h2 className="text-base font-bold">Attendance Confirmed</h2>
            <p className="text-sm text-text-secondary">
              Your attendance has been confirmed for this inspection.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (done === 'UNAVAILABLE') {
    return (
      <div className="rounded-xl border border-border-subtle bg-card-bg p-6">
        <div className="flex items-center gap-3 text-warning">
          <i className="mdi mdi-calendar-remove text-2xl" />
          <div>
            <h2 className="text-base font-bold">Unavailability Reported</h2>
            <p className="text-sm text-text-secondary">
              Your unavailability has been recorded. The team will follow up.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function handleSubmit() {
    if (!isSubmitEnabled(selection, note, slots)) return;
    // A rejected mutation must not flip the form into a success card — the parent
    // refetches portal data and renders the real state (e.g. cancelled view).
    try {
      if (selection === 'YES') {
        await onConfirm(note.trim() || undefined);
        setDone('CONFIRMED');
      } else {
        await onUnavailable({ rentalTenantNote: note.trim(), availableSlotsJson: slots });
        setDone('UNAVAILABLE');
      }
    } catch {
      // parent surfaces the failure via refetch/banner
    }
  }

  const canSubmit = isSubmitEnabled(selection, note, slots) && !isSubmitting;

  return (
    <section className="space-y-5" aria-label="Your response">
      <div>
        <h2 className="mb-1 text-base font-extrabold text-text-primary">Your response</h2>
        <p className="mb-3 text-sm font-semibold text-text-primary">
          Do you confirm the inspection?
        </p>
        <div className="flex overflow-hidden rounded-full border-[1.5px] border-border-subtle">
          <button
            type="button"
            aria-pressed={selection === 'YES'}
            disabled={isReadOnly || confirmDisabled}
            title={
              isReadOnly || confirmDisabled
                ? 'The confirmation deadline has passed'
                : undefined
            }
            onClick={() => setSelection('YES')}
            className={[
              'flex-1 py-2.5 text-sm font-extrabold transition-colors',
              selection === 'YES'
                ? 'bg-success text-white'
                : 'bg-transparent text-text-secondary hover:bg-gray-50',
              isReadOnly || confirmDisabled ? 'cursor-not-allowed opacity-50' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            Yes
          </button>
          <button
            type="button"
            aria-pressed={selection === 'NO'}
            disabled={isReadOnly}
            onClick={() => setSelection('NO')}
            className={[
              'flex-1 border-l-[1.5px] border-border-subtle py-2.5 text-sm font-extrabold transition-colors',
              selection === 'NO'
                ? 'bg-warning text-white'
                : 'bg-transparent text-text-secondary hover:bg-gray-50',
              isReadOnly ? 'cursor-not-allowed opacity-50' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            No
          </button>
        </div>
      </div>

      {selection === 'NO' && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Please add a comment describing the reason to reject the inspection.
        </div>
      )}

      <div>
        <label htmlFor="icf-note" className="mb-1 block text-sm font-semibold text-text-primary">
          Observation
        </label>
        <p className="mb-2 text-xs text-text-muted">
          Please do not leave key requests on this form. If key access is required, please
          email us separately. Key access is not available for all inspections and will be
          assessed on a case-by-case basis.
        </p>
        <textarea
          id="icf-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={isReadOnly}
          placeholder={
            selection === 'NO'
              ? 'Please describe why you cannot attend (required)'
              : 'Any additional information (optional)'
          }
          rows={3}
          maxLength={2000}
          className="w-full rounded border border-border-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
        />
      </div>

      {selection === 'NO' && (
        <div>
          <p className="mb-2 text-sm font-medium text-text-secondary">
            When are you available?
          </p>
          <WeeklyAvailabilityPicker value={slots} onChange={setSlots} disabled={isReadOnly} />
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleSubmit}
        className={[
          'w-full rounded-full py-3 text-sm font-extrabold transition-colors',
          canSubmit
            ? 'bg-real-estate text-white shadow-[0_8px_18px_-8px_color-mix(in_srgb,var(--color-real-estate)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-real-estate)_85%,black)]'
            : 'cursor-not-allowed bg-gray-100 text-text-muted',
        ].join(' ')}
      >
        {isSubmitting ? 'Submitting…' : 'Submit'}
      </button>
    </section>
  );
}
