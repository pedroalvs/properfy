import { Loader2 } from 'lucide-react';

export function SubmittingPanel() {
  return (
    <div className="flex flex-col items-center justify-center px-page-x py-16 text-center" data-testid="submitting-panel">
      <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-extrabold tracking-tight text-foreground">Submitting...</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Please do not close the app while submitting.
      </p>
    </div>
  );
}
