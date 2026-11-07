import { useRef } from 'react';

/**
 * Freezes the order of a list while the operator is interacting with it, so a
 * 30s poll never reshuffles rows under their cursor or focus (L-F05-08). While
 * `isInteracting` is true the last non-interacting order is kept (new items are
 * appended, removed items drop out); the order is released — and recomputed from
 * the fresh input — on the first non-interacting render, and whenever `resetKey`
 * (the active filter/date) changes. The item objects themselves always update;
 * only their sequence is held.
 */
export function useFrozenOrder<T>(
  items: T[],
  getId: (item: T) => string,
  opts: { isInteracting: boolean; resetKey: string },
): T[] {
  const frozenRef = useRef<{ key: string; ids: string[] } | null>(null);
  const { isInteracting, resetKey } = opts;

  // A filter/date change always releases the frozen order.
  if (frozenRef.current && frozenRef.current.key !== resetKey) {
    frozenRef.current = null;
  }

  if (!isInteracting || !frozenRef.current) {
    // Free to reorder — remember this order for the next interaction window.
    frozenRef.current = { key: resetKey, ids: items.map(getId) };
    return items;
  }

  // Interacting: keep the frozen sequence; place any new items after it.
  const order = frozenRef.current.ids;
  const byId = new Map(items.map((item) => [getId(item), item] as const));
  const frozen = order.map((id) => byId.get(id)).filter((x): x is T => x !== undefined);
  const extras = items.filter((item) => !order.includes(getId(item)));
  return [...frozen, ...extras];
}
