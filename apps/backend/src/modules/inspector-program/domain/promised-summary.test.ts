import { describe, expect, it } from 'vitest';
import { summarizePeriod } from './promised-summary';

describe('summarizePeriod', () => {
  it('sums promised as rewardAmount × participants and achieved as non-void awards', () => {
    const totals = summarizePeriod(
      [
        { rewardAmount: 30, participants: 10 },
        { rewardAmount: 60, participants: 4 },
      ],
      [
        { status: 'PENDING', amount: 30 },
        { status: 'APPROVED', amount: 30 },
        { status: 'PAID', amount: 60 },
        { status: 'VOID', amount: 30 },
      ],
    );
    expect(totals).toEqual({
      promised: 540,
      achieved: 120,
      approved: 30,
      paid: 60,
      pending: 30,
      voided: 30,
    });
  });

  it('an open period: promised from current participants, achieved 0', () => {
    const totals = summarizePeriod([{ rewardAmount: 30, participants: 5 }], []);
    expect(totals).toMatchObject({ promised: 150, achieved: 0, approved: 0, paid: 0, pending: 0, voided: 0 });
  });
});
