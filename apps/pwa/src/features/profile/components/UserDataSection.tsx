import { useState, useCallback } from 'react';
import { api } from '@/services/api';

interface UserDataSectionProps {
  inspectorId: string;
  phone: string | null | undefined;
  onSaved?: () => void;
}

export function UserDataSection({ inspectorId, phone: initialPhone, onSaved }: UserDataSectionProps) {
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDirty = phone !== (initialPhone ?? '');

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const { error: apiErr } = await api.PATCH(
        `/v1/inspectors/me` as never,
        { body: { phone: phone || null } } as never,
      );
      if (apiErr) {
        const msg = (apiErr as { error?: { message?: string } })?.error?.message;
        throw new Error(msg ?? 'Failed to save');
      }
      setSuccess(true);
      onSaved?.();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [inspectorId, phone, onSaved]);

  return (
    <div className="rounded-[24px] border border-white/70 bg-white/92 p-6 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">My Details</p>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone-input" className="text-xs font-semibold text-text-secondary">
            Phone
          </label>
          <input
            id="phone-input"
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(null); setSuccess(false); }}
            placeholder="+61 4XX XXX XXX"
            className="rounded-xl border border-black/10 bg-slate-50 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-real-estate/30"
          />
        </div>

        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-text-muted">
          <p className="font-semibold text-text-secondary">Bank details &amp; regions</p>
          <p className="mt-0.5">Payment settings and region assignments are managed by your operations team.</p>
        </div>

        {error && (
          <p className="text-xs text-error">{error}</p>
        )}
        {success && (
          <p className="text-xs text-success">Saved successfully</p>
        )}

        {isDirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full rounded-2xl bg-real-estate py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </div>
    </div>
  );
}
