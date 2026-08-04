import { buildAddressLabel } from '@/lib/address';
import { BookedSlotCard } from './BookedSlotCard';
import { SatisfactionSurveyForm, type SatisfactionSurveySubmission } from './SatisfactionSurveyForm';
import { SurveySubmittedCard } from './SurveySubmittedCard';
import type { PortalAppointment, PortalSurvey } from '../types';

interface PortalSurveyViewProps {
  appointment: PortalAppointment;
  survey: PortalSurvey;
  onSubmit: (input: SatisfactionSurveySubmission) => Promise<void>;
  isSubmitting?: boolean;
  errorMessage?: string | null;
}

/**
 * The portal once the inspection is done: same link, different job.
 *
 * Rendered from `PortalPage` as an early return rather than folded into the
 * confirmation layout — "check the date and time before confirming" is the wrong
 * thing to say about a job that already happened, and the page already juggles
 * enough interacting flags.
 */
export function PortalSurveyView({
  appointment,
  survey,
  onSubmit,
  isSubmitting,
  errorMessage,
}: PortalSurveyViewProps) {
  const address = appointment.property ? buildAddressLabel(appointment.property) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-center text-xl font-bold text-secondary">How did we go?</h1>

      <BookedSlotCard appointment={appointment} label="Inspected on" />

      {address && <p className="text-center text-sm text-text-secondary">{address}</p>}

      {survey.submitted && survey.rating !== null && survey.submittedAt ? (
        <SurveySubmittedCard
          rating={survey.rating}
          comment={survey.comment}
          submittedAt={survey.submittedAt}
        />
      ) : (
        <SatisfactionSurveyForm
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          errorMessage={errorMessage}
          inspectorName={survey.inspectorName}
        />
      )}
    </div>
  );
}
