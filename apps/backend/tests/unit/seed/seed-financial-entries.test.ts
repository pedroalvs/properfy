import { describe, it, expect } from 'vitest';
import {
  buildSeedFinancialEntries,
  seedDebitsNeedingInspectorReset,
  type SeedFinancialEntryIds,
} from '../../../prisma/seed-financial-entries';

const ids: SeedFinancialEntryIds = {
  tenant: 'tenant-1',
  tenant2: 'tenant-2',
  apptDone: 'appt-done',
  apptDone2: 'appt-done-2',
  apptCancelled: 'appt-cancelled',
  apptDoneT2: 'appt-done-t2',
  inspectorLinked: 'insp-linked',
  inspectorIndep: 'insp-indep',
  inspectorLinked2: 'insp-linked-2',
  userOP: 'user-op',
  userAM: 'user-am',
  fe1: 'fe1',
  fe2: 'fe2',
  fe3: 'fe3',
  fe4: 'fe4',
  fe5: 'fe5',
  fe6: 'fe6',
  fe7: 'fe7',
  fe8: 'fe8',
  fe9: 'fe9',
};
const pastDate = (days: number) => new Date(Date.now() - days * 86_400_000);

describe('seed financial entries (O-22)', () => {
  it('no TENANT_DEBIT or REFUND carries an inspector_id (agency leg is written with inspector_id null)', () => {
    const entries = buildSeedFinancialEntries(ids, pastDate);
    const offenders = entries
      .filter((e) => (e.entry_type === 'TENANT_DEBIT' || e.entry_type === 'REFUND') && e.inspector_id !== null)
      .map((e) => ({ id: e.id, entry_type: e.entry_type, inspector_id: e.inspector_id }));
    expect(offenders).toEqual([]);
  });

  it('keeps the inspector on every INSPECTOR_PAYOUT leg (fe2/fe4/fe9 untouched)', () => {
    const entries = buildSeedFinancialEntries(ids, pastDate);
    const payouts = entries.filter((e) => e.entry_type === 'INSPECTOR_PAYOUT');
    expect(payouts.length).toBeGreaterThan(0);
    expect(payouts.every((e) => e.inspector_id !== null)).toBe(true);
  });

  it('marks exactly the three agency-leg debits (fe1/fe3/fe8) for inspector reset on re-seed', () => {
    const reset = seedDebitsNeedingInspectorReset(ids);
    expect([...reset].sort()).toEqual(['fe1', 'fe3', 'fe8']);
  });
});
