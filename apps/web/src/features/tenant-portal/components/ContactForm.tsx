import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useUpdateContact } from '../hooks/usePortalData';
import type { PortalContact, UpdateContactInput } from '../types';

interface ContactFormProps {
  contact: PortalContact | null;
  token: string;
  isReadOnly: boolean;
}

export function ContactForm({ contact, token, isReadOnly }: ContactFormProps) {
  const { showSuccess, showError } = useSnackbar();
  const updateMutation = useUpdateContact(token);

  const [primaryEmail, setPrimaryEmail] = useState(contact?.primaryEmail ?? '');
  const [secondaryEmail, setSecondaryEmail] = useState(contact?.secondaryEmail ?? '');
  const [primaryPhone, setPrimaryPhone] = useState(contact?.primaryPhone ?? '');
  const [secondaryPhone, setSecondaryPhone] = useState(contact?.secondaryPhone ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const data: UpdateContactInput = {};
    if (primaryEmail.trim()) data.primaryEmail = primaryEmail.trim();
    if (secondaryEmail.trim()) data.secondaryEmail = secondaryEmail.trim();
    else if (contact?.secondaryEmail && !secondaryEmail.trim()) data.secondaryEmail = null;
    if (primaryPhone.trim()) data.primaryPhone = primaryPhone.trim();
    if (secondaryPhone.trim()) data.secondaryPhone = secondaryPhone.trim();
    else if (contact?.secondaryPhone && !secondaryPhone.trim()) data.secondaryPhone = null;

    if (Object.keys(data).length === 0) {
      setError('Please update at least one contact field.');
      return;
    }

    try {
      await updateMutation.mutateAsync(data);
      showSuccess('Contact information updated successfully.');
    } catch (err) {
      showError(
        err instanceof Error ? err.message : 'Failed to update contact information.',
      );
    }
  };

  return (
    <div className="rounded bg-card-bg p-6 shadow-sm">
      <h2 className="mb-2 text-base font-bold text-secondary">
        Contact Information
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        Update your contact details for this inspection.
      </p>

      {contact?.tenantName && (
        <div className="mb-4 text-sm">
          <span className="font-medium text-text-secondary">Name: </span>
          <span className="text-text-primary">{contact.tenantName}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField label="Primary Email">
          <TextInput
            type="email"
            value={primaryEmail}
            onChange={setPrimaryEmail}
            placeholder="email@example.com"
            disabled={isReadOnly}
          />
        </FormField>

        <FormField label="Secondary Email">
          <TextInput
            type="email"
            value={secondaryEmail}
            onChange={setSecondaryEmail}
            placeholder="Optional"
            disabled={isReadOnly}
          />
        </FormField>

        <FormField label="Primary Phone">
          <TextInput
            type="tel"
            value={primaryPhone}
            onChange={setPrimaryPhone}
            placeholder="+61 400 000 000"
            disabled={isReadOnly}
          />
        </FormField>

        <FormField label="Secondary Phone">
          <TextInput
            type="tel"
            value={secondaryPhone}
            onChange={setSecondaryPhone}
            placeholder="Optional"
            disabled={isReadOnly}
          />
        </FormField>

        {error && (
          <div
            role="alert"
            className="rounded border border-error/20 bg-error/5 px-3 py-2 text-sm text-error"
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="secondary"
          loading={updateMutation.isPending}
          disabled={isReadOnly}
        >
          <i className="mdi mdi-content-save text-base" />
          Update Contact
        </Button>
      </form>

      {isReadOnly && (
        <p className="mt-2 text-xs text-text-muted">
          This portal is read-only. Contact updates are no longer available.
        </p>
      )}
    </div>
  );
}
