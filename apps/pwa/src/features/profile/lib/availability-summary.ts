import type { AvailabilityTemplate } from '@properfy/shared';

const ORDER: { key: keyof AvailabilityTemplate; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

/**
 * A short, glanceable summary of the days an inspector can take work, for the
 * Profile "Availability" tile. A contiguous run renders as a range ("Mon–Fri");
 * a scattered set collapses to a count so the tile never overflows.
 */
export function summarizeAvailability(template: AvailabilityTemplate | undefined): string {
  if (!template) return 'Not set';

  const active = ORDER.filter((d) => template[d.key].am || template[d.key].pm);
  if (active.length === 0) return 'Not set';
  if (active.length === 7) return 'Every day';

  const first = active[0];
  const last = active[active.length - 1];
  if (!first || !last) return 'Not set'; // unreachable given the length guard, narrows the types
  if (active.length === 1) return first.label;

  const indices = active.map((d) => ORDER.findIndex((o) => o.key === d.key));
  const contiguous = indices.every((v, i) => {
    if (i === 0) return true;
    const prev = indices[i - 1];
    return prev !== undefined && v === prev + 1;
  });
  if (contiguous) return `${first.label}–${last.label}`;

  if (active.length > 3) return `${active.length} days/week`;
  return active.map((d) => d.label).join(', ');
}
