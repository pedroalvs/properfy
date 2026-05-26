import { useState } from 'react';
import type { AvailableSlot } from '@properfy/shared';
import { WeeklyAvailabilityPicker } from './WeeklyAvailabilityPicker';

interface InspectionConfirmationFormProps {
  onConfirm: (tenantNote?: string) => Promise<void>;
  onUnavailable: (input: { tenantNote: string; availableSlotsJson: AvailableSlot[] }) => Promise<void>;
  isSubmitting?: boolean;
  isReadOnly?: boolean;
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
}: InspectionConfirmationFormProps) {
  const [selection, setSelection] = useState<Selection>(null);
  const [note, setNote] = useState('');
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [done, setDone] = useState<'CONFIRMED' | 'UNAVAILABLE' | null>(null);

  if (done === 'CONFIRMED') {
    return (
      <div className="rounded bg-card-bg p-6 shadow-sm">
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
      <div className="rounded bg-card-bg p-6 shadow-sm">
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
    if (selection === 'YES') {
      await onConfirm(note.trim() || undefined);
      setDone('CONFIRMED');
    } else {
      await onUnavailable({ tenantNote: note.trim(), availableSlotsJson: slots });
      setDone('UNAVAILABLE');
    }
  }

  const canSubmit = isSubmitEnabled(selection, note, slots) && !isSubmitting;

  return (
    <div className="space-y-5 rounded bg-card-bg p-6 shadow-sm">
      <div>
        <p className="mb-3 text-sm font-medium text-text-primary">
          Do you confirm the inspection?
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => setSelection('YES')}
            className={[
              'rounded-full px-5 py-2 text-sm font-medium transition-colors',
              selection === 'YES'
                ? 'bg-success text-white'
                : 'bg-gray-100 text-text-secondary hover:bg-gray-200',
              isReadOnly ? 'cursor-not-allowed opacity-50' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            Yes
          </button>
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => setSelection('NO')}
            className={[
              'rounded-full px-5 py-2 text-sm font-medium transition-colors',
              selection === 'NO'
                ? 'bg-warning text-white'
                : 'bg-gray-100 text-text-secondary hover:bg-gray-200',
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
        <label htmlFor="icf-note" className="mb-1 block text-sm font-medium text-text-secondary">
          Observation
        </label>
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
          className="w-full rounded border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
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
          'w-full rounded-lg py-2.5 text-sm font-semibold transition-colors',
          canSubmit
            ? 'bg-primary text-white hover:bg-primary/90'
            : 'cursor-not-allowed bg-gray-100 text-text-muted',
        ].join(' ')}
      >
        {isSubmitting ? 'Submitting…' : 'Submit'}
      </button>
    </div>
  );
}
