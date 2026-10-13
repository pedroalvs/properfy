import { TopBar } from '@/components/shell/TopBar';
import { InstallAppCard } from '../components/InstallAppCard';

export function ProfileSettingsPage() {
  return (
    <div className="w-full pb-20">
      <TopBar title="App settings" showBack backTo="/profile" backHideOnWide />

      <div className="flex flex-col gap-4 p-4 md:mx-auto md:max-w-md">
        <InstallAppCard />
        <p className="text-center text-xs text-muted-foreground">Properfy Inspector v1.0</p>
      </div>
    </div>
  );
}
