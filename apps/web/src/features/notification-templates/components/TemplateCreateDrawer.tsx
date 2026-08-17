import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { Checkbox } from '@/components/forms/Checkbox';
import { SelectInput, type SelectOption } from '@/components/forms/SelectInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useTemplateCreate } from '../hooks/useTemplateCreate';
import { useTemplateDefault } from '../hooks/useTemplateDefault';
import { useTemplatePreview } from '../hooks/useTemplatePreview';
import { SendTestEmailDialog } from './SendTestEmailDialog';
import { SendTestSmsDialog } from './SendTestSmsDialog';
import { TemplateEditorFields } from './TemplateEditorFields';
import { TemplatePreview } from './TemplatePreview';
import {
  EMPTY_TEMPLATE_CREATE_FORM,
  MANDATORY_TEMPLATE_CODES,
  TEMPLATE_CODE_LABELS,
  TEMPLATE_VARIABLES,
  inferChannelFromCode,
  type MandatoryTemplateCode,
  type TemplateFormData,
  type TemplateFormErrors,
} from '../types';

interface TemplateCreateDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Agency options for AM/OP (loaded once at the page level). */
  tenantOptions: SelectOption[];
  /** AM/OP — show the agency selector. */
  isGlobalRole: boolean;
  /** CL_ADMIN's own tenant (used when not a global role). */
  pinnedTenantId?: string | null;
}

interface CreateErrors extends TemplateFormErrors {
  code?: string;
  tenantId?: string;
}

const CODE_OPTIONS: SelectOption[] = MANDATORY_TEMPLATE_CODES.map((c) => ({
  value: c,
  label: TEMPLATE_CODE_LABELS[c],
}));

export function TemplateCreateDrawer({
  open,
  onClose,
  onSaved,
  tenantOptions,
  isGlobalRole,
  pinnedTenantId,
}: TemplateCreateDrawerProps) {
  const { save, isSaving, validate } = useTemplateCreate();
  const { fetchDefault } = useTemplateDefault();
  const { showSuccess, showError } = useSnackbar();

  const [selectedCode, setSelectedCode] = useState<string>('');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [form, setForm] = useState<TemplateFormData>(EMPTY_TEMPLATE_CREATE_FORM);
  const [errors, setErrors] = useState<CreateErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showTestSmsDialog, setShowTestSmsDialog] = useState(false);

  // Reset everything whenever the drawer opens.
  useEffect(() => {
    if (open) {
      setSelectedCode('');
      setSelectedTenantId('');
      setForm(EMPTY_TEMPLATE_CREATE_FORM);
      setErrors({});
    }
  }, [open]);

  const channel = selectedCode ? inferChannelFromCode(selectedCode) : null;
  const isEmailChannel = channel === 'EMAIL';
  const isDirty = selectedCode !== '' || form.subject !== '' || form.body !== '';

  const varSpec = selectedCode
    ? TEMPLATE_VARIABLES[selectedCode as MandatoryTemplateCode]
    : undefined;
  const canonicalRequired = useMemo(() => (varSpec ? [...varSpec.required] : []), [varSpec]);
  const canonicalAllowed = useMemo(
    () => (varSpec ? [...varSpec.required, ...varSpec.optional] : undefined),
    [varSpec],
  );

  // Guards against an older default response landing after the operator has
  // already switched to another code.
  const prefillSeqRef = useRef(0);

  const handleCodeChange = useCallback(
    (code: string) => {
      setSelectedCode(code);
      setForm({ ...EMPTY_TEMPLATE_CREATE_FORM });
      setErrors((prev) => ({ ...prev, code: undefined, subject: undefined, body: undefined }));

      // Seed the editor from the current platform default via GET .../default —
      // the same source "Reset to default" uses. The previous implementation
      // copied whatever platform row happened to be in the (filtered) list
      // cache, which could be blank or stale.
      const seq = ++prefillSeqRef.current;
      void fetchDefault(code, inferChannelFromCode(code), undefined).then((result) => {
        if (seq !== prefillSeqRef.current || !result) return;
        setForm({ subject: result.subject ?? '', body: result.body, active: true });
      });
    },
    [fetchDefault],
  );

  const updateField = useCallback(
    <K extends keyof TemplateFormData>(field: K, value: TemplateFormData[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    },
    [],
  );

  const effectiveTenantId = isGlobalRole ? selectedTenantId : pinnedTenantId ?? '';

  const { preview: livePreview, isLoading: previewLoading } = useTemplatePreview(
    selectedCode,
    channel ?? '',
    isEmailChannel ? form.body : '',
    form.subject,
    effectiveTenantId || undefined,
  );

  const handleSubmit = useCallback(async () => {
    const nextErrors: CreateErrors = {};
    if (!selectedCode) nextErrors.code = 'Select a template';
    if (isGlobalRole && !selectedTenantId) nextErrors.tenantId = 'Please select an agency';

    const fieldErrors = selectedCode
      ? validate(form, canonicalRequired, canonicalAllowed, channel ?? 'EMAIL')
      : {};
    const merged = { ...nextErrors, ...fieldErrors };
    if (Object.keys(merged).length > 0) {
      setErrors(merged);
      return;
    }

    if (!effectiveTenantId) {
      setErrors({ tenantId: 'Please select an agency' });
      return;
    }

    const result = await save(selectedCode, effectiveTenantId, form);
    if (result.success) {
      showSuccess('Custom template created');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to create template');
    }
  }, [
    selectedCode,
    selectedTenantId,
    isGlobalRole,
    effectiveTenantId,
    channel,
    form,
    canonicalRequired,
    canonicalAllowed,
    validate,
    save,
    showSuccess,
    showError,
    onSaved,
  ]);

  const handleClose = useCallback(() => {
    if (isDirty) setShowConfirm(true);
    else onClose();
  }, [isDirty, onClose]);

  // The agency must be chosen before a test send — without it the test would
  // silently target the platform scope instead of the override being created.
  const canSendTest = selectedCode !== '' && form.body.trim() !== '' && effectiveTenantId !== '';

  return (
    <>
      <DrawerPanel open={open} onClose={handleClose} size="wide">
        <div className="flex h-full flex-col">
          <DrawerHeader title="Create Custom Template" onClose={handleClose} />

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="flex flex-col gap-6">
              <FormSection title="Template">
                <FormField label="Template type" required error={errors.code}>
                  <SelectInput
                    value={selectedCode}
                    onChange={handleCodeChange}
                    options={CODE_OPTIONS}
                    placeholder="Select template"
                    error={!!errors.code}
                    aria-label="Template type"
                  />
                </FormField>

                {channel && (
                  <div>
                    <span className="text-xs font-semibold text-text-muted">Channel</span>
                    <p className="text-sm font-semibold text-text-primary">{channel}</p>
                  </div>
                )}

                {isGlobalRole && (
                  <FormField label="Agency" required error={errors.tenantId}>
                    <SelectInput
                      value={selectedTenantId}
                      onChange={(v) => {
                        setSelectedTenantId(v);
                        setErrors((prev) => ({ ...prev, tenantId: undefined }));
                      }}
                      options={tenantOptions}
                      placeholder="Select agency"
                      error={!!errors.tenantId}
                      aria-label="Agency"
                    />
                  </FormField>
                )}
              </FormSection>

              <FormSection title="Template Content">
                <TemplateEditorFields
                  form={form}
                  errors={errors}
                  updateField={updateField}
                  channel={channel}
                  variables={canonicalAllowed}
                  toolbarDisabled={isSaving || !selectedCode}
                />
              </FormSection>

              <FormSection title="Settings">
                <Checkbox
                  checked={form.active}
                  onChange={(v) => updateField('active', v)}
                  label="Template active"
                />
              </FormSection>

              {isEmailChannel && (
                <TemplatePreview
                  subject={livePreview?.subjectRendered || form.subject}
                  htmlRendered={livePreview?.htmlRendered ?? ''}
                  channel="EMAIL"
                  isLoading={previewLoading}
                  renderError={livePreview?.renderError}
                />
              )}
            </div>
          </div>

          <div className="border-t border-black/10 px-6 py-4">
            <FormActions>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              {isEmailChannel && (
                <Button
                  variant="secondary"
                  onClick={() => setShowTestDialog(true)}
                  disabled={isSaving || !canSendTest}
                >
                  Send Test Email
                </Button>
              )}
              {channel === 'SMS' && (
                <Button
                  variant="secondary"
                  onClick={() => setShowTestSmsDialog(true)}
                  disabled={isSaving || !canSendTest}
                >
                  Send Test SMS
                </Button>
              )}
              <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                Create Template
              </Button>
            </FormActions>
          </div>
        </div>
      </DrawerPanel>

      {/* The dialogs receive the live draft — a template being created has no
          persisted row yet, so the draft is the only content there is. */}
      {isEmailChannel && (
        <SendTestEmailDialog
          open={showTestDialog}
          onClose={() => setShowTestDialog(false)}
          templateCode={selectedCode}
          channel="EMAIL"
          tenantId={effectiveTenantId || undefined}
          draftSubject={form.subject}
          draftBodyHtml={form.body}
        />
      )}
      {channel === 'SMS' && (
        <SendTestSmsDialog
          open={showTestSmsDialog}
          onClose={() => setShowTestSmsDialog(false)}
          templateCode={selectedCode}
          channel="SMS"
          tenantId={effectiveTenantId || undefined}
          draftBodyText={form.body}
        />
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Discard changes?"
        message="You have unsaved changes. Do you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Continue editing"
        variant="warning"
        onConfirm={() => {
          setShowConfirm(false);
          onClose();
        }}
        onClose={() => setShowConfirm(false)}
      />
    </>
  );
}
