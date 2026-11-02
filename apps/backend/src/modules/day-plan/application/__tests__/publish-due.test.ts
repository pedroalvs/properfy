import { describe, it, expect } from 'vitest';
import { deriveDueInspectors, type DeriveDueInput } from '../publish-due';

/**
 * §6 due-set derivation (F04-2). Pure logic over the three raw reads the publish
 * job feeds it: the `day-plan.publish` claims, tomorrow's SCHEDULED appointments
 * (already filtered to ACTIVE inspector + ACTIVE tenant), and the current plan
 * state. A pair `(inspector, plan_date)` is due when EVERY active agency of that
 * inspector's SCHEDULED appointments on `plan_date` has a claim for `plan_date − 1`
 * (condition a+b) and the plan is not already published AND notified (condition c).
 */
describe('deriveDueInspectors', () => {
  const base: DeriveDueInput = { claims: [], scheduledAppts: [], plans: [] };

  it('returns an inspector whose single agency has the T-1 claim', () => {
    const due = deriveDueInspectors({
      ...base,
      claims: [{ tenantId: 'ag-syd', localDate: '2026-11-04' }],
      scheduledAppts: [{ inspectorId: 'insp-1', tenantId: 'ag-syd', scheduledDate: '2026-11-05' }],
    });
    expect(due).toEqual([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
  });

  it('orders results by inspectorId then date', () => {
    const due = deriveDueInspectors({
      ...base,
      claims: [{ tenantId: 'ag-syd', localDate: '2026-11-04' }],
      scheduledAppts: [
        { inspectorId: 'insp-2', tenantId: 'ag-syd', scheduledDate: '2026-11-05' },
        { inspectorId: 'insp-1', tenantId: 'ag-syd', scheduledDate: '2026-11-05' },
      ],
    });
    expect(due.map((d) => d.inspectorId)).toEqual(['insp-1', 'insp-2']);
  });

  it('collapses several appointments of the same inspector on one date into one pair', () => {
    const due = deriveDueInspectors({
      ...base,
      claims: [{ tenantId: 'ag-syd', localDate: '2026-11-04' }],
      scheduledAppts: [
        { inspectorId: 'insp-1', tenantId: 'ag-syd', scheduledDate: '2026-11-05' },
        { inspectorId: 'insp-1', tenantId: 'ag-syd', scheduledDate: '2026-11-05' },
      ],
    });
    expect(due).toEqual([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
  });

  it('skips an inspector when not all of their agencies have the claim (waits for the last agency)', () => {
    // ag-syd claimed for 2026-11-04 but ag-per not yet → the whole pair waits.
    const due = deriveDueInspectors({
      ...base,
      claims: [{ tenantId: 'ag-syd', localDate: '2026-11-04' }],
      scheduledAppts: [
        { inspectorId: 'insp-1', tenantId: 'ag-syd', scheduledDate: '2026-11-05' },
        { inspectorId: 'insp-1', tenantId: 'ag-per', scheduledDate: '2026-11-05' },
      ],
    });
    expect(due).toEqual([]);
  });

  it('includes the inspector once the last agency is claimed', () => {
    const due = deriveDueInspectors({
      ...base,
      claims: [
        { tenantId: 'ag-syd', localDate: '2026-11-04' },
        { tenantId: 'ag-per', localDate: '2026-11-04' },
      ],
      scheduledAppts: [
        { inspectorId: 'insp-1', tenantId: 'ag-syd', scheduledDate: '2026-11-05' },
        { inspectorId: 'insp-1', tenantId: 'ag-per', scheduledDate: '2026-11-05' },
      ],
    });
    expect(due).toEqual([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
  });

  it('skips a pair already PUBLISHED and notified (condition c)', () => {
    const due = deriveDueInspectors({
      ...base,
      claims: [{ tenantId: 'ag-syd', localDate: '2026-11-04' }],
      scheduledAppts: [{ inspectorId: 'insp-1', tenantId: 'ag-syd', scheduledDate: '2026-11-05' }],
      plans: [
        { inspectorId: 'insp-1', planDate: '2026-11-05', publishedAt: new Date(), notifiedAt: new Date() },
      ],
    });
    expect(due).toEqual([]);
  });

  it('keeps a pair whose plan is published but not yet notified (still needs the notice)', () => {
    const due = deriveDueInspectors({
      ...base,
      claims: [{ tenantId: 'ag-syd', localDate: '2026-11-04' }],
      scheduledAppts: [{ inspectorId: 'insp-1', tenantId: 'ag-syd', scheduledDate: '2026-11-05' }],
      plans: [{ inspectorId: 'insp-1', planDate: '2026-11-05', publishedAt: new Date(), notifiedAt: null }],
    });
    expect(due).toEqual([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
  });

  it('keeps a DRAFT/STALE pair with no published_at', () => {
    const due = deriveDueInspectors({
      ...base,
      claims: [{ tenantId: 'ag-syd', localDate: '2026-11-04' }],
      scheduledAppts: [{ inspectorId: 'insp-1', tenantId: 'ag-syd', scheduledDate: '2026-11-05' }],
      plans: [{ inspectorId: 'insp-1', planDate: '2026-11-05', publishedAt: null, notifiedAt: null }],
    });
    expect(due).toEqual([{ inspectorId: 'insp-1', date: '2026-11-05' }]);
  });

  it('returns nothing when there are no claims', () => {
    const due = deriveDueInspectors({
      ...base,
      scheduledAppts: [{ inspectorId: 'insp-1', tenantId: 'ag-syd', scheduledDate: '2026-11-05' }],
    });
    expect(due).toEqual([]);
  });
});
