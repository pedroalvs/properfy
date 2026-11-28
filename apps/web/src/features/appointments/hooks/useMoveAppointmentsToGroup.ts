import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createIdempotencyKeyManager, type MoveAppointmentsToGroupResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';

/**
 * Query keys refreshed after a move: both the list and map appointment views (a
 * moved appointment changes group, status and sometimes inspector), the group
 * lists/map (member counts change and an emptied source group may auto-cancel), and
 * the per-group member cache.
 */
const INVALIDATION_KEYS: unknown[][] = [
  ['appointments'],
  ['appointments-map'],
  ['service-groups'],
  ['service-groups-map'],
  ['appointments-by-group'],
];

export interface UseMoveAppointmentsToGroupReturn {
  move: (groupId: string, appointmentIds: string[]) => Promise<MoveAppointmentsToGroupResponse | undefined>;
  isPending: boolean;
}

/**
 * Move appointments into a target group. The `Idempotency-Key` is fresh per
 * (group, selection) but reused when the SAME move is retried after a failure, and
 * rotated once it succeeds — so a lost response never double-moves. A synchronous
 * in-flight ref collapses a double-click to one request. Throws an `ApiError` the
 * caller maps.
 */
export function useMoveAppointmentsToGroup(): UseMoveAppointmentsToGroupReturn {
  const queryClient = useQueryClient();
  const keyManager = useRef(createIdempotencyKeyManager());
  const lastSignature = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [isPending, setIsPending] = useState(false);

  const move = useCallback(
    async (groupId: string, appointmentIds: string[]): Promise<MoveAppointmentsToGroupResponse | undefined> => {
      if (inFlight.current) return undefined;
      const signature = `${groupId}:${[...appointmentIds].sort().join(',')}`;
      if (lastSignature.current !== signature) {
        keyManager.current.rotate();
        lastSignature.current = signature;
      }
      inFlight.current = true;
      setIsPending(true);
      try {
        const { data, error, response } = await api.POST('/v1/service-groups/{groupId}/move-appointments', {
          params: { path: { groupId } },
          headers: { 'Idempotency-Key': keyManager.current.current() },
          body: { appointmentIds },
        });
        if (error) throw toApiError(error, (response as Response | undefined)?.status);
        lastSignature.current = null; // success → next move gets a fresh key
        INVALIDATION_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
        return (data as { data: MoveAppointmentsToGroupResponse }).data;
      } finally {
        inFlight.current = false;
        setIsPending(false);
      }
    },
    [queryClient],
  );

  return { move, isPending };
}
