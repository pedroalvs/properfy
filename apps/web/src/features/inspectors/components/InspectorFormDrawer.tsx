import { useState, useEffect, useCallback } from 'react';
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
import { DateInput } from '@/components/forms/DateInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { Checkbox } from '@/components/forms/Checkbox';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useAuth } from '@/hooks/useAuth';
import { useInspectorDetail } from '../hooks/useInspectorDetail';
import { useInspectorSave } from '../hooks/useInspectorSave';
import { useInspectorDocumentUpload } from '../hooks/useInspectorDocumentUpload';
import { DocumentUploadField } from './DocumentUploadField';
import { INSPECTOR_STATUS_OPTIONS } from '../constants/form-options';
import type { InspectorFormData, InspectorFormErrors } from '../types';
import { EMPTY_INSPECTOR_FORM } from '../types';

interface InspectorFormDrawerProps {
  open: boolean;
  onClose: () => void;
  inspectorId?: string | null;
  onSaved: () => void;
}

export function InspectorFormDrawer({
  open,
  onClose,
  inspectorId,
  onSaved,
}: InspectorFormDrawerProps) {
  const { user } = useAuth();
  const isAmOp = user?.role === 'AM' || user?.role === 'OP';

  const { options: serviceTypeOptions, isLoading: isLoadingServiceTypes } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'inspector-form-options'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
  );
  const { options: serviceRegionOptions, isLoading: isLoadingRegions } = useFormOptions<{ id: string; name: string }>(
    ['service-regions', 'inspector-form-options'],
    '/v1/service-regions',
    (item) => ({ value: item.id, label: item.name }),
  );
  const { options: tenantOptions, isLoading: isLoadingTenants } = useFormOptions<{ id: string; name: string }>(
    ['tenants', 'inspector-form-options'],
    '/v1/tenants',
    (item) => ({ value: item.id, label: item.name }),
    undefined,
    { enabled: isAmOp },
  );
  const isEditMode = !!inspectorId;
  const { inspector, isLoading: isLoadingDetail } = useInspectorDetail(
    isEditMode ? inspectorId : null,
  );
  const { save, isSaving, validate } = useInspectorSave();
  const { upload, isUploading: isDocUploading, uploadError: docUploadError } = useInspectorDocumentUpload();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<InspectorFormData>(EMPTY_INSPECTOR_FORM);
  const [initialData, setInitialData] = useState<InspectorFormData>(EMPTY_INSPECTOR_FORM);
  const [errors, setErrors] = useState<InspectorFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && inspector) {
      const data: InspectorFormData = {
        name: inspector.name,
        email: inspector.email,
        phone: inspector.phone ?? '',
        status: inspector.status,
        regionIds: inspector.regionIds ?? [],
        serviceTypes: (inspector.serviceTypes ?? []).map((s) => s.serviceTypeId).join(','),
        fullName: inspector.fullName ?? '',
        abn: inspector.abn ?? '',
        dateOfBirth: inspector.dateOfBirth ?? '',
        insuranceFileKey: inspector.insuranceFileKey ?? '',
        insuranceExpiresAt: inspector.insuranceExpiresAt ?? '',
        policeCheckFileKey: inspector.policeCheckFileKey ?? '',
        policeCheckExpiresAt: inspector.policeCheckExpiresAt ?? '',
        blockedClients: inspector.blockedClients ?? [],
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, inspector]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_INSPECTOR_FORM);
      setInitialData(EMPTY_INSPECTOR_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof InspectorFormData>(field: K, value: InspectorFormData[K]) => {
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

  const selectedServiceTypeIds = form.serviceTypes
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const toggleServiceType = useCallback((serviceTypeId: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...selectedServiceTypeIds, serviceTypeId]))
      : selectedServiceTypeIds.filter((value) => value !== serviceTypeId);
    updateField('serviceTypes', next.join(','));
  }, [selectedServiceTypeIds, updateField]);

  const toggleRegion = useCallback((regionId: string, checked: boolean) => {
    const current = form.regionIds;
    const next = checked
      ? Array.from(new Set([...current, regionId]))
      : current.filter((id) => id !== regionId);
    updateField('regionIds', next);
  }, [form.regionIds, updateField]);

  const toggleBlockedClient = useCallback((tenantId: string, checked: boolean) => {
    const current = form.blockedClients;
    const next = checked
      ? Array.from(new Set([...current, tenantId]))
      : current.filter((id) => id !== tenantId);
    updateField('blockedClients', next);
  }, [form.blockedClients, updateField]);

  const handleSubmit = useCallback(async () => {
    const mode = isEditMode ? 'edit' : 'create';
    const validationErrors = validate(form, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    const result = await save(form, inspectorId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'Inspector updated successfully' : 'Inspector created successfully');
      onSaved();
    } else if (result.errorCode === 'INSPECTOR_EMAIL_CONFLICT') {
      setErrors((prev) => ({ ...prev, email: result.error ?? 'Email already in use' }));
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, inspectorId, showSuccess, showError, onSaved]);

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
            title={isEditMode ? 'Edit Inspector' : 'New Inspector'}
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
                  <FormSection title="Personal Details" columns={2}>
                    <FormField label="Name" required error={errors.name}>
                      <TextInput
                        value={form.name}
                        onChange={(v) => updateField('name', v)}
                        aria-label="Name"
                      />
                    </FormField>
                    <FormField label="Email" required error={errors.email}>
                      <EmailInput
                        value={form.email}
                        onChange={(v) => updateField('email', v)}
                        error={!!errors.email}
                        aria-label="Email"
                      />
                    </FormField>
                    <FormField label="Phone" error={errors.phone}>
                      <PhoneInput
                        value={form.phone}
                        onChange={(v) => updateField('phone', v)}
                        error={!!errors.phone}
                        aria-label="Phone"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Coverage" columns={2}>
                    <FormField label="Service Regions" error={errors.regionIds}>
                      <div className="flex flex-col gap-3 rounded border border-black/10 px-3 py-3">
                        {serviceRegionOptions.length > 0 ? (
                          <div className="grid gap-2">
                            {serviceRegionOptions.map((option) => (
                              <Checkbox
                                key={option.value}
                                label={option.label}
                                checked={form.regionIds.includes(option.value)}
                                onChange={(checked) => toggleRegion(option.value, checked)}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-text-muted">
                            {isLoadingRegions ? 'Loading service regions...' : 'No active service regions available.'}
                          </p>
                        )}
                      </div>
                    </FormField>
                    <FormField label="Service Types" error={errors.serviceTypes}>
                      <div className="flex flex-col gap-3 rounded border border-black/10 px-3 py-3">
                        {serviceTypeOptions.length > 0 ? (
                          <div className="grid gap-2">
                            {serviceTypeOptions.map((option) => (
                              <Checkbox
                                key={option.value}
                                label={option.label}
                                checked={selectedServiceTypeIds.includes(option.value)}
                                onChange={(checked) => toggleServiceType(option.value, checked)}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-text-muted">
                            {isLoadingServiceTypes ? 'Loading service types...' : 'No active service types available.'}
                          </p>
                        )}
                      </div>
                    </FormField>
                  </FormSection>

                  <FormSection title="Profile &amp; Compliance" columns={2}>
                    <FormField label="Full Name" error={errors.fullName}>
                      <TextInput
                        value={form.fullName}
                        onChange={(v) => updateField('fullName', v)}
                        aria-label="Full Name"
                      />
                    </FormField>
                    <FormField label="ABN" error={errors.abn}>
                      <TextInput
                        value={form.abn}
                        onChange={(v) => updateField('abn', v.slice(0, 20))}
                        aria-label="ABN"
                      />
                    </FormField>
                    <FormField label="Date of Birth" error={errors.dateOfBirth}>
                      <DateInput
                        value={form.dateOfBirth}
                        onChange={(v) => updateField('dateOfBirth', v)}
                        aria-label="Date of Birth"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Insurance">
                    {isEditMode && inspectorId ? (
                      <DocumentUploadField
                        label="Insurance Certificate"
                        currentFileName={inspector?.insuranceMetaJson
                          ? ((inspector.insuranceMetaJson as { fileName?: string | null }).fileName ?? form.insuranceFileKey) || undefined
                          : form.insuranceFileKey || undefined}
                        isUploading={isDocUploading}
                        error={docUploadError}
                        onFile={(file) => upload(inspectorId, 'INSURANCE', file)}
                      />
                    ) : (
                      <FormField label="Insurance File Key" error={errors.insuranceFileKey}>
                        <TextInput
                          value={form.insuranceFileKey}
                          onChange={(v) => updateField('insuranceFileKey', v)}
                          aria-label="Insurance File Key"
                        />
                      </FormField>
                    )}
                    <FormField label="Insurance Expiry" error={errors.insuranceExpiresAt}>
                      <DateInput
                        value={form.insuranceExpiresAt}
                        onChange={(v) => updateField('insuranceExpiresAt', v)}
                        aria-label="Insurance Expiry"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Police Check">
                    {isEditMode && inspectorId ? (
                      <DocumentUploadField
                        label="Police Check Document"
                        currentFileName={inspector?.policeCheckMetaJson
                          ? ((inspector.policeCheckMetaJson as { fileName?: string | null }).fileName ?? form.policeCheckFileKey) || undefined
                          : form.policeCheckFileKey || undefined}
                        isUploading={isDocUploading}
                        error={docUploadError}
                        onFile={(file) => upload(inspectorId, 'POLICE_CHECK', file)}
                      />
                    ) : (
                      <FormField label="Police Check File Key" error={errors.policeCheckFileKey}>
                        <TextInput
                          value={form.policeCheckFileKey}
                          onChange={(v) => updateField('policeCheckFileKey', v)}
                          aria-label="Police Check File Key"
                        />
                      </FormField>
                    )}
                    <FormField label="Police Check Expiry" error={errors.policeCheckExpiresAt}>
                      <DateInput
                        value={form.policeCheckExpiresAt}
                        onChange={(v) => updateField('policeCheckExpiresAt', v)}
                        aria-label="Police Check Expiry"
                      />
                    </FormField>
                  </FormSection>

                  {isAmOp && (
                    <FormSection title="Blocked Tenants">
                      <FormField label="Blocked Tenants" error={errors.blockedClients}>
                        <div className="flex flex-col gap-3 rounded border border-black/10 px-3 py-3">
                          {tenantOptions.length > 0 ? (
                            <div className="grid gap-2">
                              {tenantOptions.map((option) => (
                                <Checkbox
                                  key={option.value}
                                  label={option.label}
                                  checked={form.blockedClients.includes(option.value)}
                                  onChange={(checked) => toggleBlockedClient(option.value, checked)}
                                />
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-text-muted">
                              {isLoadingTenants ? 'Loading tenants...' : 'No active tenants available.'}
                            </p>
                          )}
                          <p className="text-xs text-text-muted">
                            Selected tenants are blocked. Empty means eligible for all.
                          </p>
                        </div>
                      </FormField>
                    </FormSection>
                  )}

                  {isEditMode && (
                    <FormSection title="Status">
                      <FormField label="Status" error={errors.status}>
                        <SelectInput
                          value={form.status}
                          onChange={(v) => updateField('status', v)}
                          options={INSPECTOR_STATUS_OPTIONS}
                          aria-label="Status"
                        />
                      </FormField>
                    </FormSection>
                  )}
                </div>
              </div>

              <div className="border-t border-black/10 px-6 py-4">
                <FormActions>
                  <Button variant="secondary" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                    {isEditMode ? 'Save' : 'Create Inspector'}
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
    </>
  );
}
