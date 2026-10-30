import { TopBar } from '@/components/shell/TopBar';
import { PushPreferenceCard } from '@/features/push/components/PushPreferenceCard';
import { InstallAppCard } from '../components/InstallAppCard';

export function ProfileSettingsPage() {
  return (
    <div className="w-full pb-20">
      <TopBar title="App settings" showBack backTo="/profile" backHideOnWide />

      <div className="flex flex-col gap-4 p-4 md:mx-auto md:max-w-md">
        {/* The push-notification control (F02-3, D8) fills the slot the F01-3 page
            reserved, kept first so the push setting sits above the install card. */}
        <div data-testid="push-preference-slot">
          <PushPreferenceCard />
        </div>
        <InstallAppCard />
        <p className="text-center text-xs text-muted-foreground">Properfy Inspector v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
