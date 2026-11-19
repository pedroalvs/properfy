import type { AppointmentStatus } from '@properfy/shared';

/**
 * Flat, Prisma-free stop shape used to split a day plan into the fixed executed
 * prefix and the reorderable tail. Exported for F05 (L-F04-16): F05 must NOT
 * reimplement "executed" — it calls this function with the same inputs. The test
 * reads the source and fails if the Prisma client is imported here.
 */
export interface ClassifiableStop {
  appointmentId: string;
  appointmentStatus: Extract<AppointmentStatus, 'SCHEDULED' | 'DONE'>;
  startedAt: Date | null;
  finishedAt: Date | null;
  abandonedAt: Date | null;
  windowStartAt: Date;
}

/**
 * Executed (D18) = DONE, or an execution with `startedAt` and no `abandonedAt`.
 * An abandoned execution (`abandoned_at` set) returns the stop to reorderable.
 * Check-out (`finishedAt`) does not change the classification.
 */
function isExecuted(stop: ClassifiableStop): boolean {
  if (stop.appointmentStatus === 'DONE') return true;
  return stop.startedAt !== null && stop.abandonedAt === null;
}

/** The fixed prefix is ordered by `startedAt`; a DONE stop with no execution is ordered by its window. */
function executedOrderKey(stop: ClassifiableStop): number {
  return (stop.startedAt ?? stop.windowStartAt).getTime();
}

export function classifyStops(stops: ClassifiableStop[]): {
  executed: ClassifiableStop[];
  reorderable: ClassifiableStop[];
} {
  const executed: ClassifiableStop[] = [];
  const reorderable: ClassifiableStop[] = [];
  for (const stop of stops) {
    if (isExecuted(stop)) {
      executed.push(stop);
    } else {
      reorderable.push(stop);
    }
  }
  executed.sort((a, b) => executedOrderKey(a) - executedOrderKey(b));
  return { executed, reorderable };
}
