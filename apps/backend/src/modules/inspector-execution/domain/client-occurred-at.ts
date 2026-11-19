/**
 * Resolve the effective time of a field event from the device-reported time and
 * the server clock (F03, L-F03-06 / D25).
 *
 * The device time is trusted only when plausible — within 7 days in the past or
 * 5 minutes in the future of the server. An inspector who was genuinely on time
 * but synced late (Friday → Monday) keeps their real time; a wrong or forward
 * device clock is ignored and the window is evaluated against the server, never
 * fabricating an out-of-window flag ("never penalize without evidence").
 */

const PLAUSIBLE_PAST_MS = 7 * 24 * 60 * 60 * 1000;
const PLAUSIBLE_FUTURE_MS = 5 * 60 * 1000;

export interface EffectiveEventTime {
  effectiveAt: Date;
  /** true = device time used; false = device time implausible (ignored); null = no device time sent. */
  clientTimePlausible: boolean | null;
}

export function resolveEffectiveEventTime(
  clientOccurredAt: string | Date | null | undefined,
  serverNow: Date,
): EffectiveEventTime {
  if (clientOccurredAt === null || clientOccurredAt === undefined) {
    return { effectiveAt: serverNow, clientTimePlausible: null };
  }
  const client = clientOccurredAt instanceof Date ? clientOccurredAt : new Date(clientOccurredAt);
  if (Number.isNaN(client.getTime())) {
    return { effectiveAt: serverNow, clientTimePlausible: false };
  }
  // delta > 0 means the device time is in the past relative to the server.
  const delta = serverNow.getTime() - client.getTime();
  const plausible = delta <= PLAUSIBLE_PAST_MS && delta >= -PLAUSIBLE_FUTURE_MS;
  return plausible
    ? { effectiveAt: client, clientTimePlausible: true }
    : { effectiveAt: serverNow, clientTimePlausible: false };
}
