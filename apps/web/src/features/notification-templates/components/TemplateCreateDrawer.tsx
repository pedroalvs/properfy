import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { Checkbox } from '@/components/forms/Checkbox';
import { SelectInput, type SelectOption } from '@/components/forms/SelectInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useTemplateCreate, prefillFromDefault } from '../hooks/useTemplateCreate';
import { VariableInsertToolbar } from './VariableInsertToolbar';
import {
  EMPTY_TEMPLATE_CREATE_FORM,
  MANDATORY_TEMPLATE_CODES,
  TEMPLATE_CODE_LABELS,
  TEMPLATE_VARIABLES,
  inferChannelFromCode,
  type MandatoryTemplateCode,
  type NotificationTemplate,
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
  /** Already-loaded platform defaults — the create form is seeded from these. */
  platformDefaults: NotificationTemplate[];
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
  platformDefaults,
}: TemplateCreateDrawerProps) {
  const { save, isSaving, validate } = useTemplateCreate();
  const { showSuccess, showError } = useSnackbar();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [selectedCode, setSelectedCode] = useState<string>('');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [form, setForm] = useState<TemplateFormData>(EMPTY_TEMPLATE_CREATE_FORM);
  const [errors, setErrors] = useState<CreateErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

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
  const isDirty = selectedCode !== '' || form.subject !== '' || form.body !== '';

  const varSpec = selectedCode
    ? TEMPLATE_VARIABLES[selectedCode as MandatoryTemplateCode]
    : undefined;
  const canonicalRequired = useMemo(() => (varSpec ? [...varSpec.required] : []), [varSpec]);
  const canonicalAllowed = useMemo(
    () => (varSpec ? [...varSpec.required, ...varSpec.optional] : undefined),
    [varSpec],
  );

  const handleCodeChange = useCallback(
    (code: string) => {
      setSelectedCode(code);
      // Seed the editor from the platform default so the agency edits a copy.
      setForm(prefillFromDefault(code, platformDefaults));
      setErrors((prev) => ({ ...prev, code: undefined, subject: undefined, body: undefined }));
    },
    [platformDefaults],
  );

  const updateField = useCallback(
    <K extends keyof TemplateFormData>(field: K, value: TemplateFormData[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    },
    [],
  );

  const insertAtCursor = useCallback(
    (text: string) => {
      const textarea = bodyRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newBody = form.body.substring(0, start) + text + form.body.substring(end);
        updateField('body', newBody);
        requestAnimationFrame(() => {
          const cursorPos = start + text.length;
          textarea.focus();
          textarea.setSelectionRange(cursorPos, cursorPos);
        });
      } else {
        updateField('body', form.body + text);
      }
    },
    [form.body, updateField],
  );

  const handleSubmit = useCallback(async () => {
    const nextErrors: CreateErrors = {};
    if (!selectedCode) nextErrors.code = 'Select a template';
    if (isGlobalRole && !selectedTenantId) nextErrors.tenantId = 'Please select an agency';

    const fieldErrors = selectedCode ? validate(form, canonicalRequired, canonicalAllowed) : {};
    const merged = { ...nextErrors, ...fieldErrors };
    if (Object.keys(merged).length > 0) {
      setErrors(merged);
      return;
    }

    const effectiveTenantId = isGlobalRole ? selectedTenantId : pinnedTenantId ?? '';
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
    pinnedTenantId,
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

  const bodyContainerClass = errors.body
    ? 'rounded border border-error bg-white shadow-[inset_0_-1px_0_0_var(--color-error)]'
    : 'rounded border border-[#E0E0E0] bg-white shadow-[inset_0_-1px_0_0_#E0E0E0] focus-within:border-primary';

  return (
    <>
      <DrawerPanel open={open} onClose={handleClose} size="wide">
        <div className="flex h-full flex-col">
          <DrawerHeader title="Create Custom Template" onClose={handleClose} />

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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
                <FormField label="Subject" error={errors.subject}>
                  <TextInput
                    value={form.subject}
                    onChange={(v) => updateField('subject', v)}
                    placeholder="Email subject line"
                    error={!!errors.subject}
                    aria-label="Subject"
                  />
                </FormField>

                <div className="flex flex-col gap-2">
                  <VariableInsertToolbar
                    onInsert={(variable) => insertAtCursor(variable)}
                    disabled={isSaving || !selectedCode}
                    variables={canonicalAllowed}
                  />
                  <FormField label="Body" error={errors.body}>
                    <div className={bodyContainerClass}>
                      <textarea
                        ref={bodyRef}
                        value={form.body}
                        onChange={(e) => updateField('body', e.target.value)}
                        className="w-full resize-none bg-transparent px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
                        placeholder="<table>...</table>  Use {{variable}} for dynamic values"
                        rows={12}
                        aria-label="Body"
                        spellCheck={false}
                      />
                    </div>
                  </FormField>
                </div>
              </FormSection>

              <FormSection title="Settings">
                <Checkbox
                  checked={form.active}
                  onChange={(v) => updateField('active', v)}
                  label="Template active"
                />
              </FormSection>
            </div>
          </div>

          <div className="border-t border-black/10 px-6 py-4">
            <FormActions>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                Create Template
              </Button>
            </FormActions>
          </div>
        </div>
      </DrawerPanel>

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
