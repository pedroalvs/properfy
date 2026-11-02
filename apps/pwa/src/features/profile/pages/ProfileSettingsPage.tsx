import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { TopBar } from '@/components/shell/TopBar';
import { MenuList, MenuRow } from '@/components/ui/MenuRow';
import { PushPreferenceCard } from '@/features/push/components/PushPreferenceCard';
import { InstallAppCard } from '../components/InstallAppCard';

export function ProfileSettingsPage() {
  const navigate = useNavigate();

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
        {/* Replay the onboarding tour on demand (F04-3b). Opens on Today and never
            changes the recorded onboarding state. */}
        <MenuList>
          <MenuRow
            icon={<Compass className="h-5 w-5" aria-hidden="true" />}
            label="Show app tour"
            sublabel="See how the app works again"
            onClick={() => navigate('/today', { state: { replayTour: true } })}
          />
        </MenuList>
        <p className="text-center text-xs text-muted-foreground">Properfy Inspector v{__APP_VERSION__}</p>
      </div>
    </div>
  );
}
