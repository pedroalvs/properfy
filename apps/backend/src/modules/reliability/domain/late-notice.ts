import { resolveEffectiveEventTime } from '../../inspector-execution/domain/client-occurred-at';
import type { ServiceFact } from './service-fact';

/**
 * The deadline a late inspector must warn before to count as "notified in
 * advance" (metric 5, P4): the stop's frozen published ETA when the plan has
 * one, else the booked window start. Null only when neither exists (then no
 * notice can be in advance).
 */
export function advanceNoticeDeadline(fact: ServiceFact): Date | null {
  return fact.publishedEtaAt ?? fact.windowStartAt;
}

/**
 * True when some late-notice of this (same-inspector) fact has an effective time
 * strictly before the deadline. The effective time is the plausible client time,
 * else the server `created_at` (F03 D25, −7 days / +5 min). Equal to the deadline
 * does not count. With several notices the earliest effective time decides, which
 * this short-circuit matches.
 */
export function wasNotifiedInAdvance(fact: ServiceFact): boolean {
  const deadline = advanceNoticeDeadline(fact);
  if (!deadline) return false;
  const deadlineMs = deadline.getTime();
  for (const notice of fact.lateNotices) {
    const effectiveAt = resolveEffectiveEventTime(notice.clientOccurredAt, notice.createdAt).effectiveAt;
    if (effectiveAt.getTime() < deadlineMs) return true;
  }
  return false;
}
