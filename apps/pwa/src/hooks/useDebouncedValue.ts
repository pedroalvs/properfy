import { useEffect, useState } from 'react';

/**
 * Returns `value` delayed by `delayMs`: the latest value wins when several
 * changes arrive inside the window. Used to debounce the reorder order fed into
 * the server-preview query key (F04 Plan B, 400 ms). A `delayMs` of 0 updates on
 * the next tick without coalescing a burst.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
