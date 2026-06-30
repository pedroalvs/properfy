import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { Checkbox } from '@/components/forms/Checkbox';
import { Textarea } from '@/components/forms/Textarea';
import type { AppointmentFormData, AppointmentFormErrors } from '../types';

interface AppointmentRestrictionFieldsProps {
  form: AppointmentFormData;
  errors: AppointmentFormErrors;
  onToggleRestriction: (value: boolean) => void;
  onToggleIsHome: (value: boolean) => void;
  onChangeNotes: (value: string) => void;
}

export function AppointmentRestrictionFields({
  form,
  errors,
  onToggleRestriction,
  onToggleIsHome,
  onChangeNotes,
}: AppointmentRestrictionFieldsProps) {
  return (
    <FormSection title="Restrictions">
      <div className="flex flex-col gap-4">
        <Checkbox
          label="Add access restriction"
          checked={form.hasRestriction}
          onChange={onToggleRestriction}
        />
        {form.hasRestriction && (
          <>
            <Checkbox
              label="Tenant will be home"
              checked={form.restrictionIsHome}
              onChange={onToggleIsHome}
            />
            <FormField label="Restriction Notes" error={errors.restrictionNotes}>
              <Textarea
                value={form.restrictionNotes}
                onChange={onChangeNotes}
                placeholder="Access notes, unavailable windows or special handling"
                rows={4}
                aria-label="Restriction Notes"
              />
            </FormField>
          </>
        )}
      </div>
    </FormSection>
  );
}
