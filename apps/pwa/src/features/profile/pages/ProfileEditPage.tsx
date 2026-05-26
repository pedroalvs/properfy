import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/shell/TopBar';
import { AvatarUploader } from '../components/AvatarUploader';
import { EditableAvailabilityGrid } from '../components/EditableAvailabilityGrid';
import { useUpdateInspectorSelf } from '../hooks/useUpdateInspectorSelf';
import { useInspectorAvailabilityTemplate } from '../hooks/useInspectorAvailabilityTemplate';
import { useUnsavedChangesPrompt } from '@/lib/use-unsaved-changes-prompt';

export function ProfileEditPage() {
  const { user, refreshUser } = useAuth();
  const { data: availability } = useInspectorAvailabilityTemplate();
  const { mutateAsync: updateSelf, isPending: isSavingPhone } = useUpdateInspectorSelf();

  const [phone, setPhone] = useState(user?.phone ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSuccess, setPhoneSuccess] = useState(false);

  const isPhoneDirty = phone !== (user?.phone ?? '');
  const isAnyDirty = isPhoneDirty;

  useUnsavedChangesPrompt(isAnyDirty);

  const handleSavePhone = useCallback(async () => {
    setPhoneError(null);
    setPhoneSuccess(false);
    try {
      await updateSelf({ phone: phone || null });
      setPhoneSuccess(true);
      refreshUser();
      setTimeout(() => setPhoneSuccess(false), 3000);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Failed to save');
    }
  }, [phone, updateSelf, refreshUser]);

  if (!user) return null;

  return (
    <div className="w-full pb-20">
      <TopBar title="Edit Profile" showBack backTo="/profile" />

      <div className="flex flex-col gap-4 p-4">
        {/* Photo section */}
        <section
          data-testid="avatar-upload-section"
          className="rounded-[24px] border border-white/70 bg-white/92 p-6 shadow-[0_14px_30px_rgba(15,23,42,0.06)]"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Profile Photo</p>
          <div className="mt-4 flex items-center gap-4">
            {user.inspectorPhotoUrl ? (
              <img
                src={user.inspectorPhotoUrl}
                alt={user.name}
                className="h-16 w-16 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-real-estate/10 text-2xl font-bold text-real-estate">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            {user.inspectorId && (
              <AvatarUploader inspectorId={user.inspectorId} onUploaded={refreshUser} />
            )}
          </div>
        </section>

        {/* Phone section */}
        <section className="rounded-[24px] border border-white/70 bg-white/92 p-6 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Phone</p>
          <div className="mt-4 flex flex-col gap-3">
            <label htmlFor="edit-phone" className="sr-only">Phone</label>
            <input
              id="edit-phone"
              type="tel"
              aria-label="Phone"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneError(null); setPhoneSuccess(false); }}
              placeholder="+61 4XX XXX XXX"
              className="rounded-xl border border-black/10 bg-slate-50 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-real-estate/30"
            />
            {phoneError && <p className="text-xs text-error">{phoneError}</p>}
            {phoneSuccess && <p className="text-xs text-success">Saved successfully</p>}
            {isPhoneDirty && (
              <button
                type="button"
                onClick={handleSavePhone}
                disabled={isSavingPhone}
                className="w-full rounded-2xl bg-real-estate py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {isSavingPhone ? 'Saving…' : 'Save phone'}
              </button>
            )}
          </div>
        </section>

        {/* Availability section */}
        <section className="rounded-[24px] border border-white/70 bg-white/92 p-6 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Availability</p>
          <div className="mt-4">
            {availability ? (
              <EditableAvailabilityGrid availability={availability} />
            ) : (
              <p className="text-sm text-text-muted">Loading availability…</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
