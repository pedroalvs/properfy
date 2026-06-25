interface UserDataSectionProps {
  inspectorId?: string;
  phone: string | null | undefined;
  onSaved?: () => void;
}

export function UserDataSection({ phone }: UserDataSectionProps) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/92 p-6 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">My Details</p>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-secondary">Phone</span>
          <span className="text-sm text-text-primary">{phone ?? '—'}</span>
        </div>

        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-text-muted">
          <p className="font-semibold text-text-secondary">Bank details &amp; regions</p>
          <p className="mt-0.5">Payment settings and region assignments are managed by your operations team.</p>
        </div>
      </div>
    </div>
  );
}
