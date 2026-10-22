import { useNavigate } from 'react-router-dom';
import { CheckCircle2, CloudUpload } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { Button } from '@/components/ui/Button';

interface DonePanelProps {
  pendingSync?: boolean;
  onBack?: () => void;
}

export function DonePanel({ pendingSync = false, onBack }: DonePanelProps) {
  const navigate = useNavigate();
  const Icon = pendingSync ? CloudUpload : CheckCircle2;

  return (
    <div className="flex flex-col items-center justify-center px-page-x py-16 text-center" data-testid="done-panel">
      <div
        className={cn(
          'flex h-20 w-20 items-center justify-center rounded-full',
          pendingSync ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success',
        )}
      >
        <Icon className="h-10 w-10" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-extrabold tracking-tight text-foreground">
        {pendingSync ? 'Inspection Saved Locally' : 'Inspection Complete'}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {pendingSync
          ? 'Your inspection will sync automatically when you are back online. You can safely return to your schedule.'
          : 'The inspection has been submitted successfully.'}
      </p>
      <div className="mt-6">
        <Button
          variant="primary"
          onClick={() => {
            onBack?.();
            navigate('/schedule');
          }}
          data-testid="back-to-schedule"
        >
          Back to Schedule
        </Button>
      </div>
    </div>
  );
}
