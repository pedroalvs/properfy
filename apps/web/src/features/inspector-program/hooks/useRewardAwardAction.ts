import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createIdempotencyKeyManager, type RewardAwardResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';

export interface VoidArgs {
  awardId: string;
  reason: string;
  inspectorNote?: string;
}

export interface UseRewardAwardActionReturn {
  approve: (awardId: string) => Promise<RewardAwardResponse | undefined>;
  voidAward: (args: VoidArgs) => Promise<RewardAwardResponse | undefined>;
  /** The award id whose action is currently in flight, for per-row disabling. */
  pendingId: string | null;
}

/**
 * Approve / void a reward award. The `Idempotency-Key` is fresh per action but
 * **reused on a retry of the same action** (so a lost response does not double-act)
 * and only rotated once that action succeeds (idempotency-key manager contract). A
 * synchronous in-flight ref collapses a double-click to a single request. Both
 * throw an `ApiError` the caller maps (409 → "updated by someone else" + reload).
 */
export function useRewardAwardAction(): UseRewardAwardActionReturn {
  const queryClient = useQueryClient();
  const keyManager = useRef(createIdempotencyKeyManager());
  const lastSignature = useRef<string | null>(null);
  const inFlight = useRef<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Reuse the key when the same action is retried; rotate for a new action.
  const keyFor = (signature: string): string => {
    if (lastSignature.current !== signature) {
      keyManager.current.rotate();
      lastSignature.current = signature;
    }
    return keyManager.current.current();
  };

  const run = useCallback(
    async (
      awardId: string,
      signature: string,
      call: (idempotencyKey: string) => Promise<{ data?: unknown; error?: unknown; response?: unknown }>,
    ): Promise<RewardAwardResponse | undefined> => {
      // Synchronous guard — a double-click's second call returns before any request.
      if (inFlight.current) return undefined;
      inFlight.current = awardId;
      setPendingId(awardId);
      try {
        const { data, error, response } = await call(keyFor(signature));
        if (error) throw toApiError(error, (response as Response | undefined)?.status);
        lastSignature.current = null; // success → next action gets a fresh key
        queryClient.invalidateQueries({ queryKey: ['inspector-program'] });
        return (data as { data: RewardAwardResponse }).data;
      } finally {
        inFlight.current = null;
        setPendingId(null);
      }
    },
    [queryClient],
  );

  const approve = useCallback(
    (awardId: string) =>
      run(awardId, `approve:${awardId}`, (idempotencyKey) =>
        api.POST('/v1/inspector-program/awards/{awardId}/approve', {
          params: { path: { awardId } },
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
      ),
    [run],
  );

  const voidAward = useCallback(
    ({ awardId, reason, inspectorNote }: VoidArgs) =>
      run(awardId, `void:${awardId}`, (idempotencyKey) =>
        api.POST('/v1/inspector-program/awards/{awardId}/void', {
          params: { path: { awardId } },
          headers: { 'Idempotency-Key': idempotencyKey },
          body: { reason, ...(inspectorNote ? { inspectorNote } : {}) },
        }),
      ),
    [run],
  );

  return { approve, voidAward, pendingId };
}
