interface ProfileCardProps {
  name: string;
  email: string;
  role: string;
}

const roleLabelMap: Record<string, string> = {
  INSP: 'Inspector',
  AM: 'Admin Master',
  OP: 'Operator',
  CL_ADMIN: 'Client Admin',
  CL_USER: 'Client User',
};

export function ProfileCard({ name, email, role }: ProfileCardProps) {
  const roleLabel = roleLabelMap[role] ?? role;

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-real-estate/10 text-2xl font-bold text-real-estate">
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
    </div>
  );
}
