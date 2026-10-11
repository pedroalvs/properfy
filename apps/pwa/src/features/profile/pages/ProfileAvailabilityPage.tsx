import { useState } from 'react';
import { TopBar } from '@/components/shell/TopBar';
import { Card } from '@/components/ui/Card';
import { EditableAvailabilityGrid } from '../components/EditableAvailabilityGrid';
import { useInspectorAvailabilityTemplate } from '../hooks/useInspectorAvailabilityTemplate';
import { useUnsavedChangesPrompt } from '@/lib/use-unsaved-changes-prompt';

export function ProfileAvailabilityPage() {
  const { data: availability } = useInspectorAvailabilityTemplate();
  const [isDirty, setIsDirty] = useState(false);

  useUnsavedChangesPrompt(isDirty);

  return (
    <div className="w-full pb-20">
      <TopBar title="Availability" showBack backTo="/profile" />

      <div className="flex flex-col gap-4 p-4">
        <Card data-testid="availability-section">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Availability</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap the AM/PM cells to set the days and slots you can take work.
          </p>
          <div className="mt-4">
            {availability ? (
              <EditableAvailabilityGrid availability={availability} onDirtyChange={setIsDirty} />
            ) : (
              <p className="text-sm text-muted-foreground">Loading availability…</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
