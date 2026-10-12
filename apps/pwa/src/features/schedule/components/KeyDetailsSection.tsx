import { AlertCircle, KeyRound, MapPin } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';

interface KeyDetailsSectionProps {
  keyRequired: boolean;
  meetingLocation: string | null;
  restrictions: string | null;
}

export function KeyDetailsSection({ keyRequired, meetingLocation, restrictions }: KeyDetailsSectionProps) {
  if (!keyRequired && !meetingLocation && !restrictions) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="key-details-section">
      {keyRequired && (
        <Alert tone="warning">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">Key collection required</p>
            <p className="text-[13px] opacity-90">Collect the key before attending the property.</p>
          </div>
        </Alert>
      )}

      {(meetingLocation || restrictions) && (
        <Card className="overflow-hidden p-0">
          <div className="px-4 pt-4 pb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">On-site details</p>
            <div className="mt-2 flex flex-col gap-2.5 text-sm">
              {meetingLocation && (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Meeting point</p>
                    <p className="text-sm text-foreground">{meetingLocation}</p>
                  </div>
                </div>
              )}
              {restrictions && (
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Restrictions</p>
                    <p className="text-sm text-foreground">{restrictions}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
