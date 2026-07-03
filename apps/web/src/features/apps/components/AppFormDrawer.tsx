import { useCallback, useEffect, useMemo, useState } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { Checkbox } from '@/components/forms/Checkbox';
import { usePaginatedQuery } from '@/hooks/useApiQuery';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useAppSave } from '../hooks/useAppSave';
import { EMPTY_APP_FORM, type AppFormData, type AppFormErrors, type AppCredentialRow } from '../types';

interface AppFormDrawerProps {
  open: boolean;
  onClose: () => void;
  /** When provided, the drawer is in edit mode and prefills from this row. */
  app?: AppCredentialRow | null;
  /** Pre-selected agency for the create form (from the page's agency filter). */
  defaultTenantId?: string;
  onSaved: () => void;
}

export function AppFormDrawer({ open, onClose, app, defaultTenantId, onSaved }: AppFormDrawerProps) {
  const isEditMode = !!app;
  const { save, isSaving, validate } = useAppSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<AppFormData>(EMPTY_APP_FORM);
  const [errors, setErrors] = useState<AppFormErrors>({});
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: tenantsResp } = usePaginatedQuery<{ id: string; name: string }>(
    ['tenants', 'app-form'],
    '/v1/tenants',
    { page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' },
    { enabled: open && !isEditMode },
  );
  const tenantOptions = useMemo(
    () => (tenantsResp?.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    [tenantsResp],
  );

  // Branch scope is optional: no branch = agency-wide credential.
  const effectiveTenantId = app?.tenantId ?? form.tenantId;
  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'app-form', effectiveTenantId],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
    { ...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}), status: 'ACTIVE' },
    { enabled: open && !!effectiveTenantId },
  );
  const branchSelectOptions = useMemo(
    () => [{ value: '', label: 'All branches' }, ...branchOptions],
    [branchOptions],
  );

  // Reset the form whenever the drawer opens (or the target row changes).
  useEffect(() => {
    if (!open) return;
    setForm(
      app
        ? {
            tenantId: app.tenantId,
            branchId: app.branchId ?? '',
            name: app.name,
            username: app.username,
            password: app.password,
            needsAuthCode: app.needsAuthCode,
            authCode: app.authCode ?? '',
            appUrl: app.appUrl ?? '',
            instructionsUrl: app.instructionsUrl ?? '',
            instructionsPassword: app.instructionsPassword ?? '',
          }
        : { ...EMPTY_APP_FORM, tenantId: defaultTenantId ?? '' },
    );
    setErrors({});
    setIsDirty(false);
  }, [open, app, defaultTenantId]);

  const updateField = useCallback(<K extends keyof AppFormData>(key: K, value: AppFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const handleTenantChange = useCallback((tenantId: string) => {
    // Branch belongs to the agency — reset it when the agency changes.
    setForm((prev) => ({ ...prev, tenantId, branchId: '' }));
    setIsDirty(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    const validationErrors = validate(form, isEditMode ? 'edit' : 'create');
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    const result = await save(form, app?.id);
    if (result.success) {
      showSuccess(isEditMode ? 'App updated successfully' : 'App created successfully');
      onSaved();
      return;
    }
    showError(result.errorMessage ?? 'Failed to save app');
  }, [form, isEditMode, validate, save, app?.id, showSuccess, showError, onSaved]);

  const handleClose = useCallback(() => {
    if (isDirty) setShowConfirm(true);
    else onClose();
  }, [isDirty, onClose]);

  return (
    <>
      <DrawerPanel open={open} onClose={handleClose} size="wide">
        <div className="flex h-full flex-col">
          <DrawerHeader title={isEditMode ? 'Edit App' : 'New App'} onClose={handleClose} />
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-6">
              <FormSection title="Identification" columns={2}>
                {isEditMode ? (
                  <FormField label="Agency">
                    <TextInput value={app?.tenantName ?? '—'} onChange={() => {}} disabled aria-label="Agency" />
                  </FormField>
                ) : (
                  <FormField label="Agency" required error={errors.tenantId}>
                    <SelectInput
                      value={form.tenantId}
                      onChange={handleTenantChange}
                      options={tenantOptions}
                      placeholder="Select agency"
                      aria-label="Agency"
                    />
                  </FormField>
                )}
                <FormField label="Branch" error={errors.branchId}>
                  <SelectInput
                    value={form.branchId}
                    onChange={(v) => updateField('branchId', v)}
                    options={branchSelectOptions}
                    placeholder="All branches"
                    disabled={!effectiveTenantId}
                    aria-label="Branch"
                  />
                </FormField>
                <FormField label="Name" required error={errors.name}>
                  <TextInput value={form.name} onChange={(v) => updateField('name', v)} aria-label="Name" />
                </FormField>
              </FormSection>

              <FormSection title="Credentials" columns={2}>
                <FormField label="Username" required error={errors.username}>
                  <TextInput value={form.username} onChange={(v) => updateField('username', v)} aria-label="Username" />
                </FormField>
                <FormField label="Password" required error={errors.password}>
                  <TextInput value={form.password} onChange={(v) => updateField('password', v)} aria-label="Password" />
                </FormField>
                <div className="col-span-2">
                  <Checkbox
                    checked={form.needsAuthCode}
                    onChange={(checked) => updateField('needsAuthCode', checked)}
                    label="Needs authentication code"
                  />
                </div>
                {form.needsAuthCode && (
                  <FormField label="Authentication code" required error={errors.authCode}>
                    <TextInput
                      value={form.authCode}
                      onChange={(v) => updateField('authCode', v)}
                      aria-label="Authentication code"
                    />
                  </FormField>
                )}
              </FormSection>
              <p className="-mt-3 text-xs text-text-secondary">
                Secrets are stored encrypted and shown in plaintext to operators and the
                assigned inspector.
              </p>

              <FormSection title="Links & instructions" columns={2}>
                <FormField label="App link" error={errors.appUrl}>
                  <TextInput
                    value={form.appUrl}
                    onChange={(v) => updateField('appUrl', v)}
                    placeholder="https://…"
                    aria-label="App link"
                  />
                </FormField>
                <FormField label="Instructions link" error={errors.instructionsUrl}>
                  <TextInput
                    value={form.instructionsUrl}
                    onChange={(v) => updateField('instructionsUrl', v)}
                    placeholder="https://…"
                    aria-label="Instructions link"
                  />
                </FormField>
                <FormField label="Instructions password" error={errors.instructionsPassword}>
                  <TextInput
                    value={form.instructionsPassword}
                    onChange={(v) => updateField('instructionsPassword', v)}
                    aria-label="Instructions password"
                  />
                </FormField>
              </FormSection>
            </div>
          </div>
          <FormActions>
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleSubmit} loading={isSaving}>
              {isEditMode ? 'Save changes' : 'Create app'}
            </Button>
          </FormActions>
        </div>
      </DrawerPanel>
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          onClose();
        }}
        title="Discard changes?"
        message="You have unsaved changes. Discard them?"
        confirmLabel="Discard"
        variant="warning"
      />
    </>
  );
}
