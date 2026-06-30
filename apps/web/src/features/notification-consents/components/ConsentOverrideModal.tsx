import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import type { ConsentRecord } from '../hooks/useConsentLookup';

interface ConsentOverrideModalProps {
  consent: ConsentRecord;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Feature 018 US4: operator override modal. Mandatory reason. On success,
 * calls onSuccess (the parent refetches).
 */
export function ConsentOverrideModal({ consent, onClose, onSuccess }: ConsentOverrideModalProps) {
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation<void, ApiError, string>({
    mutationFn: async (overrideReason) => {
      const { error } = await api.POST(
        '/v1/notifications/consents/{consentId}/override' as any,
        {
          params: { path: { consentId: consent.id } as any },
          body: { reason: overrideReason } as any,
        },
      );
      if (error) {
        const status = (error as { status?: number }).status ?? 500;
        const message = (error as { error?: { message?: string } }).error?.message ?? 'Override failed';
        throw new ApiError(status, message);
      }
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (err) => {
      setErrorMsg(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!reason.trim()) {
      setErrorMsg('Reason is required');
      return;
    }
    mutation.mutate(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-medium text-secondary">Override Opt-Out</h2>
        <p className="mb-4 text-sm text-text-secondary">
          You are re-subscribing <strong>{consent.recipient}</strong> on{' '}
          <strong>{consent.channel}</strong> ({consent.notificationClass}) on their behalf. This
          action is audited.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="mb-2 block text-sm font-medium">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={1000}
            className="mb-3 w-full rounded border border-gray-300 p-2 text-sm focus:border-primary focus:outline-none"
            placeholder="Contact called in to confirm they want to receive notifications"
            required
          />
          {errorMsg && (
            <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {errorMsg}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              disabled={mutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !reason.trim()}
              className="rounded bg-[#F37A76] px-4 py-2 text-sm font-semibold text-white hover:bg-[#E8665F] disabled:opacity-50"
            >
              {mutation.isPending ? 'Overriding…' : 'Confirm Override'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
