import type { SmsTemplateMeasurement } from '@properfy/shared';

interface SmsLengthIndicatorProps {
  measurement: SmsTemplateMeasurement;
}

/**
 * Live character / segment counter for the SMS template editor. It measures the
 * body as it renders with sample values (the same basis the save-guard uses), so
 * the count the operator sees is the count that blocks the save. Surfaces the
 * detected encoding and part count because each part is billed separately, and a
 * body over the 10-part limit would be truncated on send.
 */
export function SmsLengthIndicator({ measurement }: SmsLengthIndicatorProps) {
  const { length, limit, parts, encoding, overLimit } = measurement;
  const encodingLabel = encoding === 'GSM-7' ? 'GSM-7' : 'Unicode (UCS-2)';
  const approaching = !overLimit && limit > 0 && length >= limit * 0.9;

  let note: { text: string; tone: 'error' | 'warning' } | null = null;
  if (overLimit) {
    note = { text: `Over the limit by ${length - limit} — the message would be cut off and cannot be saved.`, tone: 'error' };
  } else if (approaching) {
    note = { text: 'Approaching the 10-part limit.', tone: 'warning' };
  } else if (parts > 1) {
    note = { text: `Sends as ${parts} parts — each part is billed.`, tone: 'warning' };
  }

  return (
    <div role="status" aria-live="polite" data-testid="sms-length-indicator" className="mt-1 text-xs">
      <span className={overLimit ? 'text-error' : 'text-text-muted'}>
        {length} / {limit} characters · {encodingLabel} · {parts} {parts === 1 ? 'part' : 'parts'}
      </span>
      {note && (
        <span className={note.tone === 'error' ? 'ml-2 text-error' : 'ml-2 text-warning'}>{note.text}</span>
      )}
      {encoding === 'UCS-2' && (
        <span className="ml-2 text-text-muted">Accents or emoji switch the message to Unicode (70/67 characters per part).</span>
      )}
      <span className="ml-2 text-text-muted">Counted with sample values; real values may differ.</span>
    </div>
  );
}
