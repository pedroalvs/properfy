import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center py-12 text-center">
      <i className="mdi mdi-alert-circle-outline text-[64px] text-text-muted" aria-hidden="true" />
      <h1 className="mt-4 text-[24px] font-bold text-secondary">Page Not Found</h1>
      <p className="mt-2 text-sm text-text-secondary">
        The page you're looking for doesn't exist.
      </p>
      <div className="mt-6">
        <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
      </div>
    </div>
  );
}
