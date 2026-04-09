import { Button } from '@/components/ui/Button';

interface NoPermissionStateProps {
  message?: string;
  action?: { label: string; onClick: () => void };
}

export function NoPermissionState({
  message = "You don't have permission to view this content.",
  action,
}: NoPermissionStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" role="status">
      <i className="mdi mdi-lock-outline text-[48px] text-text-muted" aria-hidden="true" />
      <p className="mt-4 text-base font-semibold text-text-primary">{message}</p>
      {action && (
        <div className="mt-4">
          <Button variant="outlined" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
