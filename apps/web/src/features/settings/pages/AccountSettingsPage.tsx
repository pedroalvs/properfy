import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { formatDateTime } from '@/lib/format-date';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { USER_ROLE_MAP } from '@/lib/status-colors';

export function AccountSettingsPage() {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader title="Account Settings" />

      <div className="flex flex-col gap-6">
        <div className="rounded bg-card-bg p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-secondary">Profile</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs text-text-muted">Name</p>
              <p className="text-sm font-medium">{user?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Email</p>
              <p className="text-sm font-medium">{user?.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Role</p>
              <p className="text-sm font-medium">
                {user?.role ? (USER_ROLE_MAP[user.role as keyof typeof USER_ROLE_MAP]?.label ?? user.role) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Phone</p>
              <p className="text-sm font-medium">{user?.phone ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Last Login</p>
              <p className="text-sm font-medium">
                {user?.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}
              </p>
            </div>
          </div>
        </div>

        <ChangePasswordForm />
      </div>
    </div>
  );
}
