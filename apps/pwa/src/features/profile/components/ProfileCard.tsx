interface ProfileCardProps {
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  totpEnabled?: boolean;
  lastLoginAt?: string | null;
}

const roleLabelMap: Record<string, string> = {
  INSP: 'Inspector',
  AM: 'Admin Master',
  OP: 'Operator',
  CL_ADMIN: 'Client Admin',
  CL_USER: 'Client User',
};

function formatLastLogin(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function ProfileCard({ name, email, role, phone, totpEnabled, lastLoginAt }: ProfileCardProps) {
  const roleLabel = roleLabelMap[role] ?? role;

  return (
    <div className="rounded-[24px] border border-white/70 bg-white/92 p-6 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-real-estate/10 text-2xl font-bold text-real-estate shadow-[inset_0_0_0_1px_rgba(5,150,105,0.10)]">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-text-primary">{name}</h2>
          <p className="truncate text-sm text-text-secondary">{email}</p>
          <span className="mt-1 inline-block rounded bg-real-estate/10 px-2 py-0.5 text-xs font-semibold text-real-estate">
            {roleLabel}
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 border-t border-black/5 pt-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">Phone</span>
          <span className="font-medium text-text-primary">{phone ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">Two-Factor</span>
          <span className={totpEnabled ? 'font-medium text-green-700' : 'font-medium text-amber-700'}>
            {totpEnabled ? 'Enabled' : 'Not enabled'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-secondary">Last Login</span>
          <span className="font-medium text-text-primary">{formatLastLogin(lastLoginAt)}</span>
        </div>
      </div>
    </div>
  );
}
