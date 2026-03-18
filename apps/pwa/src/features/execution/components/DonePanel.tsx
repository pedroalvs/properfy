import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function DonePanel() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center px-page-x py-16 text-center" data-testid="done-panel">
      <i className="mdi mdi-check-circle text-[64px] text-success" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-bold text-secondary">Inspection Complete</h2>
      <p className="mt-2 text-sm text-text-secondary">
        The inspection has been submitted successfully.
      </p>
      <div className="mt-6">
        <Button variant="primary" onClick={() => navigate('/schedule')} data-testid="back-to-schedule">
          Back to Schedule
        </Button>
      </div>
    </div>
  );
}
