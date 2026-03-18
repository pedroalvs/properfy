import { useState, useEffect, useCallback, useRef } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { Checkbox } from '@/components/forms/Checkbox';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useTemplateSave } from '../hooks/useTemplateSave';
import { VariableInsertToolbar } from './VariableInsertToolbar';
import { TemplatePreview } from './TemplatePreview';
import type { NotificationTemplate, TemplateFormData, TemplateFormErrors } from '../types';

interface TemplateFormDrawerProps {
  open: boolean;
  onClose: () => void;
  template: NotificationTemplate | null;
  onSaved: () => void;
}

export function TemplateFormDrawer({
  open,
  onClose,
  template,
  onSaved,
}: TemplateFormDrawerProps) {
  const { save, isSaving, validate } = useTemplateSave();
  const { showSuccess, showError } = useSnackbar();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [form, setForm] = useState<TemplateFormData>({ subject: '', body: '', active: true });
  const [initialData, setInitialData] = useState<TemplateFormData>({ subject: '', body: '', active: true });
  const [errors, setErrors] = useState<TemplateFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (template && open) {
      const data: TemplateFormData = {
        subject: template.subject,
        body: template.body,
        active: template.active,
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [template, open]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof TemplateFormData>(field: K, value: TemplateFormData[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        if (prev[field as keyof TemplateFormErrors]) {
          const next = { ...prev };
          delete next[field as keyof TemplateFormErrors];
          return next;
        }
        return prev;
      });
    },
    [],
  );

  const handleInsertVariable = useCallback((variable: string) => {
    const textarea = bodyRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentBody = form.body;
      const newBody = currentBody.substring(0, start) + variable + currentBody.substring(end);
      updateField('body', newBody);

      requestAnimationFrame(() => {
        const cursorPos = start + variable.length;
        textarea.focus();
        textarea.setSelectionRange(cursorPos, cursorPos);
      });
    } else {
      updateField('body', form.body + variable);
    }
  }, [form.body, updateField]);

  const handleSubmit = useCallback(async () => {
    if (!template) return;

    const validationErrors = validate(form, template.requiredVariables);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await save(template.code, template.channel, form);
    if (result.success) {
      showSuccess('Template updated successfully');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save template');
    }
  }, [template, form, validate, save, showSuccess, showError, onSaved]);

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

  const bodyContainerClass = errors.body
    ? 'rounded border border-error bg-white shadow-[inset_0_-1px_0_0_var(--color-error)]'
    : 'rounded border border-[#E0E0E0] bg-white shadow-[inset_0_-1px_0_0_#E0E0E0] focus-within:border-primary';

  return (
    <>
      <DrawerPanel open={open} onClose={handleClose} size="wide">
        <div className="flex h-full flex-col">
          <DrawerHeader
            title={template ? `Edit Template: ${template.code}` : 'Edit Template'}
            onClose={handleClose}
          />

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-6">
              {template && (
                <div className="flex items-center gap-4 rounded bg-[#F5F5F5] px-4 py-3">
                  <div>
                    <span className="text-xs font-semibold text-text-muted">Code</span>
                    <p className="text-sm font-semibold text-text-primary">{template.code}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-text-muted">Channel</span>
                    <p className="text-sm font-semibold text-text-primary">{template.channel}</p>
                  </div>
                  {template.requiredVariables.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-text-muted">Required Variables</span>
                      <p className="text-sm text-text-primary">
                        {template.requiredVariables.map((v) => `{{${v}}}`).join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )}

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
                    onInsert={handleInsertVariable}
                    disabled={isSaving}
                  />
                  <FormField label="Body" error={errors.body}>
                    <div className={bodyContainerClass}>
                      <textarea
                        ref={bodyRef}
                        value={form.body}
                        onChange={(e) => updateField('body', e.target.value)}
                        className="w-full resize-none bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
                        placeholder="Template body content with {{variables}}"
                        rows={10}
                        aria-label="Body"
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

              {template && (
                <TemplatePreview
                  subject={form.subject}
                  body={form.body}
                  channel={template.channel}
                />
              )}
            </div>
          </div>

          <div className="border-t border-black/10 px-6 py-4">
            <FormActions>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                Save
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
        onConfirm={forceClose}
        onClose={cancelDiscard}
      />
    </>
  );
}
