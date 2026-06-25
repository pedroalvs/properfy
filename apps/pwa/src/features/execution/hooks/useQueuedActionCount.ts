import { useState, useEffect } from 'react';
import { getAllQueuedActions } from '../lib/indexeddb';

const POLL_INTERVAL_MS = 5000;

export function useQueuedActionCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function fetchCount() {
      try {
        const actions = await getAllQueuedActions();
        if (mounted) {
          setCount(actions.length);
        }
      } catch {
        // IndexedDB may be unavailable; keep current count
      }
    }

    fetchCount();
    const interval = setInterval(fetchCount, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return count;
}
