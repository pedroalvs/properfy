import { useState, useEffect, useCallback } from 'react';
import { AppointmentStatus, AppointmentContactRole, ContactType, ContactChannelType, todayLocalDateString, isTimeStartInPastForDate } from '@properfy/shared';
import { useQueryClient } from '@tanstack/react-query';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { EmailInput } from '@/components/forms/EmailInput';
import { PhoneInput } from '@/components/forms/PhoneInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { DateInput } from '@/components/forms/DateInput';
import { Textarea } from '@/components/forms/Textarea';
import { Checkbox } from '@/components/forms/Checkbox';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useFormOptions } from '@/hooks/useFormOptions';
import { api } from '@/services/api';
import { PropertyFormDrawer } from '@/features/properties/components/PropertyFormDrawer';
import { useAppointmentDetail } from '../hooks/useAppointmentDetail';
import { useAppointmentSave } from '../hooks/useAppointmentSave';
import { AppointmentRestrictionFields } from './AppointmentRestrictionFields';
import { ContactAutocomplete } from './ContactAutocomplete';
import { useTimeSlotOptions } from '../hooks/useTimeSlotOptions';
import type { AppointmentFormData, AppointmentFormErrors, ContactFormEntry } from '../types';
import { EMPTY_FORM_DATA, createEmptyContact } from '../types';
import type { ContactSearchResult } from '../hooks/useContactSearch';

const CONTACT_ROLE_OPTIONS = [
  { value: AppointmentContactRole.TENANT, label: 'Tenant' },
  { value: AppointmentContactRole.TENANT_REPRESENTATIVE, label: 'Tenant Representative' },
  { value: AppointmentContactRole.HOUSEKEEPER, label: 'Housekeeper' },
  { value: AppointmentContactRole.PROPERTY_MANAGER, label: 'Property Manager' },
  { value: AppointmentContactRole.BROKER, label: 'Broker' },
  { value: AppointmentContactRole.OTHER, label: 'Other' },
];

// 023 §FR-251 — `Contact type` differs from `Role in this appointment`.
// Type pins the registry row's persona; role describes the participation in
// THIS specific appointment. Keep the labels distinct in the UI to avoid
// the "I picked Tenant in role, why am I being asked again?" confusion.
const CONTACT_TYPE_OPTIONS = [
  { value: ContactType.TENANT, label: 'Tenant' },
  { value: ContactType.PROPERTY_MANAGER, label: 'Property Manager' },
  { value: ContactType.HOUSEKEEPER, label: 'Housekeeper' },
  { value: ContactType.BROKER, label: 'Broker' },
  { value: ContactType.OTHER, label: 'Other' },
];

const CHANNEL_OPTIONS = [
  { value: ContactChannelType.EMAIL, label: 'Email' },
  { value: ContactChannelType.PHONE, label: 'Phone' },
];

interface AppointmentFormDrawerProps {
  open: boolean;
  onClose: () => void;
  appointmentId?: string | null;
  onSaved: () => void;
}

export function AppointmentFormDrawer({
  open,
  onClose,
  appointmentId,
  onSaved,
}: AppointmentFormDrawerProps) {
  const { user } = useAuth();
  const isGlobalRole = user?.role === 'AM' || user?.role === 'OP';
  const canAssignRole = user?.role === 'AM' || user?.role === 'OP';
  const queryClient = useQueryClient();

  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [selectedInspectorId, setSelectedInspectorId] = useState('');

  const { options: tenantOptions } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'form-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isGlobalRole },
  );

  const isEditMode = !!appointmentId;
  const { appointment, isLoading: isLoadingDetail } = useAppointmentDetail(
    isEditMode ? appointmentId : null,
  );

  const [form, setForm] = useState<AppointmentFormData>(EMPTY_FORM_DATA);
  const [initialData, setInitialData] = useState<AppointmentFormData>(EMPTY_FORM_DATA);
  const [errors, setErrors] = useState<AppointmentFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [propertyDrawerOpen, setPropertyDrawerOpen] = useState(false);

  // In edit mode, derive tenantId from the loaded appointment so branch/property options load
  const effectiveTenantId = isGlobalRole
    ? (selectedTenantId || (isEditMode && appointment?.tenantId) || '')
    : undefined;

  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'form-options', effectiveTenantId ?? ''],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    { ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}), status: 'ACTIVE' },
    { enabled: !isGlobalRole || !!effectiveTenantId },
  );
  const { options: serviceTypeOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'form-options'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
  );
  const { options: inspectorOptions } = useFormOptions<{ id: string; name: string }>(
    ['inspectors', 'appointment-form-options'],
    '/v1/inspectors',
    (item) => ({ value: item.id, label: item.name }),
    { status: 'ACTIVE' },
    { enabled: canAssignRole },
  );
  const { options: propertyOptions } = useFormOptions<{ id: string; street: string; propertyCode: string }>(
    ['properties', 'form-options', effectiveTenantId ?? '', 'branch', form.branchId],
    '/v1/properties',
    (item) => ({ value: item.id, label: `${item.propertyCode} - ${item.street}` }),
    {
      ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
      ...(form.branchId ? { branchId: form.branchId } : {}),
    },
    { enabled: (!isGlobalRole || !!effectiveTenantId) && !!form.branchId },
  );
  const { options: timeSlotOptions, isError: timeSlotError, error: timeSlotErrorMsg, refetch: refetchTimeSlots } = useTimeSlotOptions(
    form.branchId || undefined,
    effectiveTenantId,
  );

  const { save, isSaving, validate } = useAppointmentSave();
  const { showSuccess, showError } = useSnackbar();

  // Populate form in edit mode
  useEffect(() => {
    if (isEditMode && appointment) {
      // Build contacts array from new-shape or legacy fields
      const contacts: ContactFormEntry[] =
        appointment.contacts && appointment.contacts.length > 0
          ? appointment.contacts.map((c) => ({
              key: c.id ?? crypto.randomUUID(),
              contactId: c.contactId ?? undefined,
              name: c.snapshotName ?? '',
              email: c.snapshotEmail ?? '',
              phone: c.snapshotPhone ?? '',
              role: c.role ?? ('TENANT' as AppointmentContactRole),
              isPrimary: c.isPrimary ?? false,
            }))
          : [
              {
                key: crypto.randomUUID(),
                name: appointment.contactName ?? '',
                email: appointment.contactEmail ?? '',
                phone: appointment.contactPhone ?? '',
                role: 'TENANT' as AppointmentContactRole,
                isPrimary: true,
              },
            ];

      const data: AppointmentFormData = {
        branchId: appointment.branchId,
        propertyId: appointment.propertyId,
        serviceTypeId: appointment.serviceTypeId,
        scheduledDate: (appointment.scheduledDate ?? '').split('T')[0] ?? '',
        timeSlot: appointment.timeSlot,
        contactName: appointment.contactName,
        contactPhone: appointment.contactPhone ?? '',
        contactEmail: appointment.contactEmail ?? '',
        contacts,
        keyRequired: appointment.keyRequired,
        meetingLocation: appointment.meetingLocation ?? '',
        keyLocation: appointment.keyLocation ?? '',
        notes: appointment.notes ?? '',
        hasRestriction: (appointment.restrictions?.length ?? 0) > 0,
        restrictionIsHome: appointment.restrictions?.[0]?.isHome ?? false,
        restrictionNotes: appointment.restrictions?.[0]?.notes ?? '',
        restrictionTouched: false,
      };
      setForm(data);
      setInitialData(data);
      setSelectedInspectorId(appointment.inspectorId ?? '');
      setErrors({});
    }
  }, [isEditMode, appointment]);

  // Reset form when opening in create mode
  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_FORM_DATA);
      setInitialData(EMPTY_FORM_DATA);
      setErrors({});
      setSelectedTenantId('');
      setSelectedInspectorId('');
    }
  }, [open, isEditMode]);

  const handleTenantChange = useCallback((tenantId: string) => {
    setSelectedTenantId(tenantId);
    setForm((prev) => ({ ...prev, branchId: '', propertyId: '', timeSlot: '' }));
  }, []);

  const handleBranchChange = useCallback((branchId: string) => {
    setForm((prev) => ({ ...prev, branchId, propertyId: '' }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.branchId;
      delete next.propertyId;
      return next;
    });
  }, []);

  const handleRestrictionToggle = useCallback((value: boolean) => {
    setForm((prev) => ({
      ...prev,
      hasRestriction: value,
      restrictionTouched: true,
      ...(value ? {} : { restrictionIsHome: false, restrictionNotes: '' }),
    }));
  }, []);

  const handleRestrictionIsHomeChange = useCallback((value: boolean) => {
    setForm((prev) => ({
      ...prev,
      hasRestriction: true,
      restrictionIsHome: value,
      restrictionTouched: true,
    }));
  }, []);

  const handleRestrictionNotesChange = useCallback((value: string) => {
    setForm((prev) => ({
      ...prev,
      hasRestriction: true,
      restrictionNotes: value,
      restrictionTouched: true,
    }));
    setErrors((prev) => {
      if (prev.restrictionNotes) {
        const next = { ...prev };
        delete next.restrictionNotes;
        return next;
      }
      return prev;
    });
  }, []);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);
  const canAssignInspector =
    isEditMode &&
    canAssignRole &&
    appointment?.status === AppointmentStatus.AWAITING_INSPECTOR;
  const hasInspectorAssignmentChange =
    canAssignInspector &&
    !!selectedInspectorId &&
    selectedInspectorId !== (appointment?.inspectorId ?? '');
  const primaryLabel = hasInspectorAssignmentChange
    ? 'Save & Assign Inspector'
    : isEditMode
      ? 'Save'
      : 'Create Appointment';

  const updateField = useCallback(
    <K extends keyof AppointmentFormData>(field: K, value: AppointmentFormData[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        if (prev[field]) {
          const next = { ...prev };
          delete next[field];
          return next;
        }
        return prev;
      });
    },
    [],
  );

  const addContact = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      contacts: [...prev.contacts, createEmptyContact()],
    }));
  }, []);

  const removeContact = useCallback((key: string) => {
    setForm((prev) => {
      const updated = prev.contacts.filter((c) => c.key !== key);
      // If we removed the primary, make the first one primary
      if (updated.length > 0 && !updated.some((c) => c.isPrimary)) {
        const first = updated[0]!;
        updated[0] = { key: first.key, name: first.name, email: first.email, phone: first.phone, role: first.role, isPrimary: true };
      }
      return { ...prev, contacts: updated };
    });
  }, []);

  const updateContact = useCallback(
    <K extends keyof ContactFormEntry>(key: string, field: K, value: ContactFormEntry[K]) => {
      setForm((prev) => ({
        ...prev,
        contacts: prev.contacts.map((c) =>
          c.key === key ? { ...c, [field]: value } : c,
        ),
      }));
    },
    [],
  );

  const selectRegistryContact = useCallback(
    (key: string, contact: ContactSearchResult) => {
      setForm((prev) => ({
        ...prev,
        contacts: prev.contacts.map((c) =>
          c.key === key
            ? {
                ...c,
                contactId: contact.id,
                name: contact.displayName,
                email: contact.primaryEmail ?? '',
                phone: contact.primaryPhone ?? '',
              }
            : c,
        ),
      }));
    },
    [],
  );

  const clearRegistryContact = useCallback((key: string) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c) =>
        c.key === key
          ? { ...c, contactId: undefined, name: '', email: '', phone: '' }
          : c,
      ),
    }));
  }, []);

  const setPrimaryContact = useCallback((key: string) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c) => ({
        ...c,
        isPrimary: c.key === key,
      })),
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const mode = isEditMode ? 'edit' : 'create';
    const validationErrors = validate(form, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const shouldSaveAppointment = !isEditMode || isDirty;
    let savedAppointment = false;

    if (shouldSaveAppointment) {
      const result = await save(form, appointmentId ?? undefined);
      if (!result.success) {
        const errorMessage = result.error === 'APPOINTMENT_CONTACT_NOT_FOUND'
          ? 'One or more contacts belong to a different agency and cannot be linked to this appointment.'
          : (result.error ?? 'Failed to save');
        showError(errorMessage);
        return;
      }
      savedAppointment = true;
    }

    if (hasInspectorAssignmentChange && appointmentId) {
      const { error } = await api.POST(
        `/v1/appointments/${appointmentId}/status-transitions` as any,
        {
          body: {
            targetStatus: AppointmentStatus.SCHEDULED,
            inspectorId: selectedInspectorId,
          } as any,
          headers: {
            'Idempotency-Key': crypto.randomUUID(),
          },
        },
      );
      if (error) {
        const message = (error as any)?.error?.message ?? 'Failed to assign inspector';
        showError(
          savedAppointment
            ? `Appointment updated, but inspector assignment failed: ${message}`
            : message,
        );
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['appointments', appointmentId] });
    }

    if (isEditMode) {
      if (hasInspectorAssignmentChange) {
        showSuccess('Appointment updated and inspector assigned successfully');
      } else if (savedAppointment) {
        showSuccess('Appointment updated successfully');
      } else {
        showSuccess('Inspector assigned successfully');
      }
    } else {
      showSuccess('Appointment created successfully');
    }
    onSaved();
  }, [
    isEditMode,
    form,
    validate,
    save,
    appointmentId,
    showSuccess,
    showError,
    onSaved,
    isDirty,
    hasInspectorAssignmentChange,
    selectedInspectorId,
    queryClient,
  ]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const forceClose = useCallback(() => {
    setShowConfirm(false);
    onClose();
  }, [onClose]);

  const cancelDiscard = useCallback(() => {
    setShowConfirm(false);
  }, []);

  return (
    <>
      <DrawerPanel open={open} onClose={handleClose} size="wide">
        <div className="flex h-full flex-col">
          <DrawerHeader
            title={isEditMode ? 'Edit Appointment' : 'New Appointment'}
            onClose={handleClose}
          />

          {isEditMode && isLoadingDetail ? (
            <div className="flex-1 px-6 py-4">
              <LoadingState rows={6} />
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="flex flex-col gap-6">
                  <FormSection title="Appointment Details" columns={2}>
                    {isGlobalRole && !isEditMode && (
                      <FormField label="Agency" required>
                        <SelectInput
                          value={selectedTenantId}
                          onChange={handleTenantChange}
                          options={tenantOptions}
                          placeholder="Select agency"
                          aria-label="Agency"
                        />
                      </FormField>
                    )}
                    <FormField label="Branch" required error={errors.branchId}>
                      <SelectInput
                        value={form.branchId}
                        onChange={handleBranchChange}
                        options={branchOptions}
                        placeholder="Select branch"
                        disabled={isEditMode}
                        error={!!errors.branchId}
                        aria-label="Branch"
                      />
                    </FormField>
                    <FormField label="Property" required error={errors.propertyId}>
                      <SelectInput
                        value={form.propertyId}
                        onChange={(v) => updateField('propertyId', v)}
                        options={propertyOptions}
                        placeholder="Select property"
                        disabled={isEditMode || !form.branchId}
                        error={!!errors.propertyId}
                        aria-label="Property"
                      />
                    </FormField>
                    {!isEditMode && (
                      <div className="md:col-span-2">
                        <Button
                          variant="secondary"
                          onClick={() => setPropertyDrawerOpen(true)}
                          disabled={!form.branchId || (isGlobalRole && !selectedTenantId)}
                        >
                          <i className="mdi mdi-home-plus-outline" aria-hidden="true" />
                          Property not listed? Create one
                        </Button>
                      </div>
                    )}
                    <FormField label="Service Type" required error={errors.serviceTypeId}>
                      <SelectInput
                        value={form.serviceTypeId}
                        onChange={(v) => updateField('serviceTypeId', v)}
                        options={serviceTypeOptions}
                        placeholder="Select type"
                        disabled={isEditMode}
                        error={!!errors.serviceTypeId}
                        aria-label="Service Type"
                      />
                    </FormField>
                    <FormField label="Scheduled Date" required error={errors.scheduledDate}>
                      <DateInput
                        value={form.scheduledDate}
                        onChange={(v) => updateField('scheduledDate', v)}
                        // Edit-conditional: allow keeping a legacy past date when editing;
                        // create flow always enforces min=today.
                        min={(() => {
                          const today = todayLocalDateString();
                          if (!isEditMode) return today;
                          const existing = (appointment?.scheduledDate ?? '').split('T')[0] ?? '';
                          return existing < today ? undefined : today;
                        })()}
                        error={!!errors.scheduledDate}
                        aria-label="Scheduled Date"
                      />
                    </FormField>
                    <FormField label="Time Slot" required error={errors.timeSlot ?? (timeSlotError ? (timeSlotErrorMsg ?? undefined) : undefined)}>
                      {timeSlotError ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-error">Failed to load time slots</span>
                          <button type="button" className="text-sm font-semibold text-primary" onClick={() => refetchTimeSlots()}>Retry</button>
                        </div>
                      ) : (
                        <SelectInput
                          value={form.timeSlot}
                          onChange={(v) => updateField('timeSlot', v)}
                          options={(() => {
                            const today = todayLocalDateString();
                            if (form.scheduledDate !== today) return timeSlotOptions;
                            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                            return timeSlotOptions.filter((opt) => !isTimeStartInPastForDate(opt.value, form.scheduledDate, tz));
                          })()}
                          placeholder={!form.branchId ? 'Select a branch first' : 'Select time slot'}
                          disabled={!form.branchId || timeSlotOptions.length === 0}
                          error={!!errors.timeSlot}
                          aria-label="Time Slot"
                        />
                      )}
                    </FormField>
                  </FormSection>

                  <FormSection title="Contacts">
                    {form.contacts.map((contact, idx) => {
                      const isLinked = !!contact.contactId;
                      return (
                        <div key={contact.key} className="rounded border border-black/10 p-4 mb-3">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-secondary">
                              Contact {idx + 1}
                              {isLinked && (
                                <span className="ml-2 text-xs font-normal text-success">
                                  <i className="mdi mdi-link-variant" aria-hidden="true" /> Linked
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <input
                                  type="radio"
                                  name="primaryContact"
                                  checked={contact.isPrimary}
                                  onChange={() => setPrimaryContact(contact.key)}
                                  className="accent-primary"
                                />
                                <span className={contact.isPrimary ? 'font-semibold text-primary' : 'text-text-secondary'}>
                                  Primary
                                </span>
                              </label>
                              {form.contacts.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeContact(contact.key)}
                                  className="text-error hover:text-error/80 text-sm font-medium"
                                  aria-label={`Remove contact ${idx + 1}`}
                                >
                                  <i className="mdi mdi-close-circle-outline text-lg" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          </div>

                          {!isLinked && (
                            <div className="mb-3">
                              <FormField label="Search existing contact">
                                <ContactAutocomplete
                                  value={contact.name}
                                  selectedContactId={contact.contactId}
                                  onSelect={(c) => selectRegistryContact(contact.key, c)}
                                  onClear={() => clearRegistryContact(contact.key)}
                                  placeholder={isGlobalRole && !effectiveTenantId ? 'Select an agency first' : 'Search by name, email or phone...'}
                                  tenantId={effectiveTenantId || user?.tenantId || undefined}
                                  disabled={!!(isGlobalRole && !effectiveTenantId)}
                                  aria-label={`Search contact ${idx + 1}`}
                                />
                              </FormField>
                              <p className="mt-1 text-xs text-text-muted">
                                Or fill in the fields below to create a new contact
                              </p>
                            </div>
                          )}

                          {isLinked && (
                            <div className="mb-3">
                              <div className="flex items-center justify-between rounded bg-primary/5 px-3 py-2">
                                <span className="text-sm text-text-primary">
                                  {contact.name}
                                  {contact.email && <span className="text-text-secondary"> &middot; {contact.email}</span>}
                                  {contact.phone && <span className="text-text-secondary"> &middot; {contact.phone}</span>}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => clearRegistryContact(contact.key)}
                                  className="text-xs font-medium text-primary hover:underline"
                                  aria-label={`Unlink contact ${idx + 1}`}
                                >
                                  Change
                                </button>
                              </div>
                            </div>
                          )}

                          {!isLinked && (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <FormField label="Display name" required error={errors.contacts?.[idx]?.name}>
                                  <TextInput
                                    value={contact.name}
                                    onChange={(v) => updateContact(contact.key, 'name', v)}
                                    placeholder="Full name"
                                    error={!!errors.contacts?.[idx]?.name}
                                    aria-label={`Contact ${idx + 1} Display name`}
                                  />
                                </FormField>
                                <FormField
                                  label="Contact type"
                                  required
                                  error={errors.contacts?.[idx]?.contactType}
                                >
                                  <SelectInput
                                    value={contact.contactType ?? ''}
                                    onChange={(v) => updateContact(contact.key, 'contactType', v as ContactType)}
                                    options={CONTACT_TYPE_OPTIONS}
                                    placeholder="Select type"
                                    aria-label={`Contact ${idx + 1} Contact type`}
                                  />
                                </FormField>
                                <FormField label="Role in this appointment" required error={errors.contacts?.[idx]?.role}>
                                  <SelectInput
                                    value={contact.role}
                                    onChange={(v) => updateContact(contact.key, 'role', v as AppointmentContactRole)}
                                    options={CONTACT_ROLE_OPTIONS}
                                    placeholder="Select role"
                                    aria-label={`Contact ${idx + 1} Role`}
                                  />
                                </FormField>
                                <FormField label="Company" error={errors.contacts?.[idx]?.company}>
                                  <TextInput
                                    value={contact.company ?? ''}
                                    onChange={(v) => updateContact(contact.key, 'company', v)}
                                    aria-label={`Contact ${idx + 1} Company`}
                                  />
                                </FormField>
                                <FormField label="Email" error={errors.contacts?.[idx]?.email}>
                                  <EmailInput
                                    value={contact.email}
                                    onChange={(v) => updateContact(contact.key, 'email', v)}
                                    error={!!errors.contacts?.[idx]?.email}
                                    aria-label={`Contact ${idx + 1} Email`}
                                  />
                                </FormField>
                                <FormField label="Phone" error={errors.contacts?.[idx]?.phone}>
                                  <PhoneInput
                                    value={contact.phone}
                                    onChange={(v) => updateContact(contact.key, 'phone', v)}
                                    error={!!errors.contacts?.[idx]?.phone}
                                    aria-label={`Contact ${idx + 1} Phone`}
                                  />
                                </FormField>
                              </div>
                              <p className="-mt-1 text-xs text-text-secondary">
                                Provide at least one of email or phone.
                              </p>
                              {/* 023 §FR-253 — additional channels repeater (collapsed by default). */}
                              <details className="mt-2">
                                <summary className="cursor-pointer text-sm font-medium text-text-secondary">
                                  Additional channels
                                </summary>
                                <div className="mt-2 flex flex-col gap-2">
                                  {(contact.additionalChannels ?? []).map((ch, channelIdx) => (
                                    <div key={channelIdx} className="grid grid-cols-1 md:grid-cols-[120px_1fr_1fr_auto] gap-2 items-end">
                                      <FormField label="Channel">
                                        <SelectInput
                                          value={ch.channel}
                                          onChange={(v) => {
                                            const next = [...(contact.additionalChannels ?? [])];
                                            next[channelIdx] = { ...next[channelIdx]!, channel: v as ContactChannelType };
                                            updateContact(contact.key, 'additionalChannels', next);
                                          }}
                                          options={CHANNEL_OPTIONS}
                                          aria-label={`Contact ${idx + 1} channel ${channelIdx + 1} type`}
                                        />
                                      </FormField>
                                      <FormField label="Value">
                                        <TextInput
                                          value={ch.value}
                                          onChange={(v) => {
                                            const next = [...(contact.additionalChannels ?? [])];
                                            next[channelIdx] = { ...next[channelIdx]!, value: v };
                                            updateContact(contact.key, 'additionalChannels', next);
                                          }}
                                          aria-label={`Contact ${idx + 1} channel ${channelIdx + 1} value`}
                                        />
                                      </FormField>
                                      <FormField label="Label (optional)">
                                        <TextInput
                                          value={ch.label ?? ''}
                                          onChange={(v) => {
                                            const next = [...(contact.additionalChannels ?? [])];
                                            next[channelIdx] = { ...next[channelIdx]!, label: v };
                                            updateContact(contact.key, 'additionalChannels', next);
                                          }}
                                          aria-label={`Contact ${idx + 1} channel ${channelIdx + 1} label`}
                                        />
                                      </FormField>
                                      <Button
                                        variant="secondary"
                                        onClick={() => {
                                          const next = (contact.additionalChannels ?? []).filter((_, i) => i !== channelIdx);
                                          updateContact(contact.key, 'additionalChannels', next);
                                        }}
                                        aria-label={`Remove channel ${channelIdx + 1}`}
                                      >
                                        <i className="mdi mdi-close" aria-hidden="true" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    variant="secondary"
                                    onClick={() =>
                                      updateContact(contact.key, 'additionalChannels', [
                                        ...(contact.additionalChannels ?? []),
                                        { channel: ContactChannelType.EMAIL, value: '', label: '' },
                                      ])
                                    }
                                  >
                                    <i className="mdi mdi-plus" aria-hidden="true" /> Add channel
                                  </Button>
                                </div>
                              </details>
                              <details className="mt-2">
                                <summary className="cursor-pointer text-sm font-medium text-text-secondary">
                                  Notes
                                </summary>
                                <div className="mt-2">
                                  <FormField label="Notes" error={errors.contacts?.[idx]?.notes}>
                                    <TextInput
                                      value={contact.notes ?? ''}
                                      onChange={(v) => updateContact(contact.key, 'notes', v)}
                                      aria-label={`Contact ${idx + 1} notes`}
                                    />
                                  </FormField>
                                </div>
                              </details>
                            </>
                          )}
                          {isLinked && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <FormField label="Role" required error={errors.contacts?.[idx]?.role}>
                                <SelectInput
                                  value={contact.role}
                                  onChange={(v) => updateContact(contact.key, 'role', v as AppointmentContactRole)}
                                  options={CONTACT_ROLE_OPTIONS}
                                  placeholder="Select role"
                                  aria-label={`Contact ${idx + 1} Role`}
                                />
                              </FormField>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <Button variant="secondary" onClick={addContact}>
                      <i className="mdi mdi-plus" aria-hidden="true" />
                      Add Contact
                    </Button>
                  </FormSection>

                  <FormSection title="Access & Key" columns={2}>
                    <div className="flex items-center">
                      <Checkbox
                        label="Key required"
                        checked={form.keyRequired}
                        onChange={(v) => updateField('keyRequired', v)}
                      />
                    </div>
                    <div />
                    <FormField label="Meeting Location" error={errors.meetingLocation}>
                      <TextInput
                        value={form.meetingLocation}
                        onChange={(v) => updateField('meetingLocation', v)}
                        placeholder="Where to meet"
                        aria-label="Meeting Location"
                      />
                    </FormField>
                    <FormField label="Key Location" error={errors.keyLocation}>
                      <TextInput
                        value={form.keyLocation}
                        onChange={(v) => updateField('keyLocation', v)}
                        placeholder="Where to pick up key"
                        aria-label="Key Location"
                      />
                    </FormField>
                  </FormSection>

                  <AppointmentRestrictionFields
                    form={form}
                    errors={errors}
                    onToggleRestriction={handleRestrictionToggle}
                    onToggleIsHome={handleRestrictionIsHomeChange}
                    onChangeNotes={handleRestrictionNotesChange}
                  />

                  {canAssignInspector && (
                    <FormSection title="Assignment">
                      <FormField label="Inspector">
                        <SelectInput
                          value={selectedInspectorId}
                          onChange={setSelectedInspectorId}
                          options={inspectorOptions}
                          placeholder="Select inspector"
                          aria-label="Inspector"
                        />
                      </FormField>
                    </FormSection>
                  )}

                  <FormSection title="Notes">
                    <FormField label="Notes" error={errors.notes}>
                      <Textarea
                        value={form.notes}
                        onChange={(v) => updateField('notes', v)}
                        rows={4}
                        placeholder="Additional information"
                        aria-label="Notes"
                      />
                    </FormField>
                  </FormSection>
                </div>
              </div>

              <div className="border-t border-black/10 px-6 py-4">
                <FormActions>
                  <Button variant="secondary" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                    {primaryLabel}
                  </Button>
                </FormActions>
              </div>
            </>
          )}
        </div>
      </DrawerPanel>

      <ConfirmDialog
        open={showConfirm}
        title="Discard changes?"
        message="You have unsaved changes. Do you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Continue editing"
        variant="warning"
        onConfirm={forceClose}
        onClose={cancelDiscard}
      />
      <PropertyFormDrawer
        open={propertyDrawerOpen}
        onClose={() => setPropertyDrawerOpen(false)}
        onSaved={() => setPropertyDrawerOpen(false)}
        tenantIdOverride={effectiveTenantId}
        initialBranchId={form.branchId}
        lockBranch
        onCreated={(propertyId) => {
          setPropertyDrawerOpen(false);
          updateField('propertyId', propertyId);
        }}
      />
    </>
  );
}
