import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabsNav } from '@/components/layout/TabsNav';
import { useAuth } from '@/hooks/useAuth';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { formatInstantDateTime } from '@/lib/format-date';
import { TimezonePreferenceCard } from '../components/TimezonePreferenceCard';
import { AgencyTimezoneCard } from '../components/AgencyTimezoneCard';
import { SecuritySettingsSection } from '../components/SecuritySettingsSection';
import { USER_ROLE_MAP } from '@/lib/status-colors';
import { formatAuPhone } from '@/lib/phone-mask';

/** Roles that may hold a personal timezone override (cross-tenant roles). */
const PERSONAL_TIMEZONE_ROLES = ['AM', 'OP', 'INSP'];

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
];

export function AccountSettingsPage() {
  const { user } = useAuth();
  const effectiveTimezone = useEffectiveTimezone();
  const hasPersonalTimezone = !!user && PERSONAL_TIMEZONE_ROLES.includes(user.role);
  const isClAdmin = user?.role === 'CL_ADMIN';
  const isClUser = user?.role === 'CL_USER';

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'security' ? 'security' : 'profile';
  const setActiveTab = (tab: string) => {
    setSearchParams(tab === 'profile' ? {} : { tab }, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Account Settings" />

      <div className="mb-6">
        <TabsNav tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'security' ? (
        <SecuritySettingsSection />
      ) : (
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
              <p className="text-sm font-medium">{user?.phone ? formatAuPhone(user.phone) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Last Login</p>
              <p className="text-sm font-medium">
                {user?.lastLoginAt ? formatInstantDateTime(user.lastLoginAt) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Timezone</p>
              <p className="text-sm font-medium">
                {effectiveTimezone}
                {isClUser ? ' (set by your agency)' : ''}
              </p>
            </div>
          </div>
        </div>

          {hasPersonalTimezone && <TimezonePreferenceCard />}
          {isClAdmin && <AgencyTimezoneCard />}
        </div>
      )}
    </div>
  );
}
