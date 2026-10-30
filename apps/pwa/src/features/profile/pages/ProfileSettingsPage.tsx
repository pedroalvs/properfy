import { TopBar } from '@/components/shell/TopBar';
import { InstallAppCard } from '../components/InstallAppCard';

export function ProfileSettingsPage() {
  return (
    <div className="w-full pb-20">
      <TopBar title="App settings" showBack backTo="/profile" backHideOnWide />

      <div className="flex flex-col gap-4 p-4 md:mx-auto md:max-w-md">
        {/* Reserved slot for the push-notification control — F02 fills it (D8, L-F01-12).
            Kept as the first content child so the push setting lands above the install card. */}
        <div data-testid="push-preference-slot" />
        <InstallAppCard />
        <p className="text-center text-xs text-muted-foreground">Properfy Inspector v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
