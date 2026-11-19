import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFrozenOrder } from './useFrozenOrder';

const id = (s: string) => s;

describe('useFrozenOrder', () => {
  it('holds the order while interacting, then releases on the first idle render', () => {
    const { result, rerender } = renderHook(
      ({ items, interacting, key }: { items: string[]; interacting: boolean; key: string }) =>
        useFrozenOrder(items, id, { isInteracting: interacting, resetKey: key }),
      { initialProps: { items: ['A', 'B'], interacting: false, key: 'k' } },
    );
    expect(result.current).toEqual(['A', 'B']);

    // Poll reorders to [B, A] while the pointer is over the list → order frozen.
    rerender({ items: ['B', 'A'], interacting: true, key: 'k' });
    expect(result.current).toEqual(['A', 'B']);

    // Leaving the list releases the freeze and the new order shows.
    rerender({ items: ['B', 'A'], interacting: false, key: 'k' });
    expect(result.current).toEqual(['B', 'A']);
  });

  it('releases the freeze when the filter/date (resetKey) changes', () => {
    const { result, rerender } = renderHook(
      ({ items, interacting, key }: { items: string[]; interacting: boolean; key: string }) =>
        useFrozenOrder(items, id, { isInteracting: interacting, resetKey: key }),
      { initialProps: { items: ['A', 'B'], interacting: false, key: 'k' } },
    );
    rerender({ items: ['B', 'A'], interacting: true, key: 'k' });
    expect(result.current).toEqual(['A', 'B']); // frozen

    rerender({ items: ['B', 'A'], interacting: true, key: 'k2' }); // filter changed
    expect(result.current).toEqual(['B', 'A']);
  });

  it('keeps frozen items in place and appends new ones while interacting', () => {
    const { result, rerender } = renderHook(
      ({ items, interacting }: { items: string[]; interacting: boolean }) =>
        useFrozenOrder(items, id, { isInteracting: interacting, resetKey: 'k' }),
      { initialProps: { items: ['A', 'B'], interacting: false } },
    );
    rerender({ items: ['B', 'C', 'A'], interacting: true });
    // A, B kept in frozen order; C is new → appended.
    expect(result.current).toEqual(['A', 'B', 'C']);
  });

  it('drops removed items from the frozen order while interacting', () => {
    const { result, rerender } = renderHook(
      ({ items, interacting }: { items: string[]; interacting: boolean }) =>
        useFrozenOrder(items, id, { isInteracting: interacting, resetKey: 'k' }),
      { initialProps: { items: ['A', 'B', 'C'], interacting: false } },
    );
    rerender({ items: ['C', 'A'], interacting: true });
    expect(result.current).toEqual(['A', 'C']);
  });
});
