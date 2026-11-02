import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { classifyStops, type ClassifiableStop } from '../classify-stops';

const at = (hhmm: string): Date => new Date(`2026-11-05T${hhmm}:00.000Z`);

const stop = (over: Partial<ClassifiableStop> & { appointmentId: string }): ClassifiableStop => ({
  appointmentStatus: 'SCHEDULED',
  startedAt: null,
  finishedAt: null,
  abandonedAt: null,
  windowStartAt: at('08:00'),
  ...over,
});

describe('classifyStops', () => {
  it('splits DONE + started into the executed prefix and leaves abandoned/not-started reorderable', () => {
    const input: ClassifiableStop[] = [
      stop({ appointmentId: 'A', appointmentStatus: 'DONE', windowStartAt: at('08:00') }),
      stop({ appointmentId: 'B', startedAt: at('08:05') }),
      stop({ appointmentId: 'C', startedAt: at('09:00'), abandonedAt: at('09:10') }),
      stop({ appointmentId: 'D' }),
    ];
    const { executed, reorderable } = classifyStops(input);
    expect(executed.map((s) => s.appointmentId)).toEqual(['A', 'B']);
    expect(reorderable.map((s) => s.appointmentId)).toEqual(['C', 'D']);
  });

  it('orders the executed prefix by startedAt, DONE-without-execution by window', () => {
    const input: ClassifiableStop[] = [
      stop({ appointmentId: 'late', startedAt: at('10:00') }),
      stop({ appointmentId: 'doneEarly', appointmentStatus: 'DONE', windowStartAt: at('07:00') }),
      stop({ appointmentId: 'early', startedAt: at('08:00') }),
    ];
    const { executed } = classifyStops(input);
    expect(executed.map((s) => s.appointmentId)).toEqual(['doneEarly', 'early', 'late']);
  });

  it('check-out (finishedAt) keeps a started stop executed', () => {
    const input = [stop({ appointmentId: 'X', startedAt: at('08:05'), finishedAt: at('08:50') })];
    expect(classifyStops(input).executed.map((s) => s.appointmentId)).toEqual(['X']);
  });

  it('returns empty arrays for empty input', () => {
    expect(classifyStops([])).toEqual({ executed: [], reorderable: [] });
  });

  it('does not import @prisma/client (pure domain, reusable by F05)', () => {
    const source = readFileSync(fileURLToPath(new URL('../classify-stops.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/from\s+['"]@prisma\/client['"]/);
  });
});
