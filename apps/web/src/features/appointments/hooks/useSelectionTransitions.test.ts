import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSelectionTransitions } from './useSelectionTransitions';

describe('useSelectionTransitions', () => {
  it('returns only targets EVERY selected row can reach (intersection)', () => {
    // DRAFT (OP) → AWAITING_INSPECTOR | REJECTED | CANCELLED
    // SCHEDULED (OP) → DONE | REJECTED | CANCELLED
    // intersection → REJECTED, CANCELLED
    const { result } = renderHook(() =>
      useSelectionTransitions([{ status: 'DRAFT' }, { status: 'SCHEDULED' }], 'OP'),
    );
    expect(result.current.targets).toEqual(expect.arrayContaining(['REJECTED', 'CANCELLED']));
    expect(result.current.targets).not.toContain('AWAITING_INSPECTOR'); // not reachable from SCHEDULED
    expect(result.current.targets).not.toContain('DONE'); // not reachable from DRAFT
  });

  it('is empty when no role or no rows', () => {
    const { result: noRole } = renderHook(() =>
      useSelectionTransitions([{ status: 'DRAFT' }], undefined),
    );
    expect(noRole.current.targets).toEqual([]);
    const { result: noRows } = renderHook(() => useSelectionTransitions([], 'OP'));
    expect(noRows.current.targets).toEqual([]);
  });

  it('requires a reason if ANY row needs one for the target — not just the first (WEB-9)', () => {
    // [DRAFT, REJECTED] → AWAITING_INSPECTOR:
    //   DRAFT → AWAITING_INSPECTOR needs NO reason
    //   REJECTED → AWAITING_INSPECTOR DOES need a reason
    // Deciding from row 0 (DRAFT) alone would wrongly return false — the bug this fixes.
    const { result } = renderHook(() =>
      useSelectionTransitions([{ status: 'DRAFT' }, { status: 'REJECTED' }], 'OP'),
    );
    // AWAITING_INSPECTOR must be a common target for this to be meaningful.
    expect(result.current.targets).toContain('AWAITING_INSPECTOR');
    expect(result.current.isReasonRequired('AWAITING_INSPECTOR')).toBe(true);
  });

  it('does not require a reason when no selected row needs one for the target', () => {
    // DRAFT → AWAITING_INSPECTOR needs no reason.
    const { result } = renderHook(() =>
      useSelectionTransitions([{ status: 'DRAFT' }], 'OP'),
    );
    expect(result.current.isReasonRequired('AWAITING_INSPECTOR')).toBe(false);
  });

  it('never requires a reason for an empty target', () => {
    const { result } = renderHook(() =>
      useSelectionTransitions([{ status: 'REJECTED' }], 'OP'),
    );
    expect(result.current.isReasonRequired('')).toBe(false);
  });
});
