import { useDetailQuery } from '@/hooks/useApiQuery';
import { FormSection } from '@/components/forms/FormSection';
import { StarRating } from '@/components/ui/StarRating';
import { formatInstantDateTime } from '@/lib/format-date';

interface AppointmentSatisfactionSectionProps {
  appointmentId: string;
  /** Only a completed inspection can have been rated. */
  isDone: boolean;
}

interface SurveyResponse {
  rating: number;
  comment: string | null;
  submittedAt: string;
}

/**
 * The rental tenant's satisfaction response for this inspection — where an
 * operator investigating a complaint actually looks.
 *
 * Renders nothing at all when the inspection is not done or has no response:
 * an empty "Satisfaction" panel on every appointment would be noise. The API
 * returns null (not 404) for an unrated inspection, and a 403 for an inspector,
 * both of which collapse to the same absent section.
 */
export function AppointmentSatisfactionSection({
  appointmentId,
  isDone,
}: AppointmentSatisfactionSectionProps) {
  const { data } = useDetailQuery<SurveyResponse | null>(
    ['appointments', appointmentId, 'survey'],
    `/v1/appointments/${appointmentId}/survey`,
    { enabled: isDone, retry: false },
  );
  const survey = data?.data ?? null;

  if (!isDone || !survey) return null;

  return (
    <FormSection title="Satisfaction">
      <div className="flex items-center gap-3">
        <StarRating value={survey.rating} size="md" showValue />
        <span className="text-xs text-text-muted">
          submitted {formatInstantDateTime(survey.submittedAt)}
        </span>
      </div>
      {survey.comment && <p className="mt-2 text-sm text-text-secondary">“{survey.comment}”</p>}
    </FormSection>
  );
}
