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
import { useTemplatePreview } from '../hooks/useTemplatePreview';
import { ImageLibraryModal } from './ImageLibraryModal';
import { SendTestEmailDialog } from './SendTestEmailDialog';
import { SendTestSmsDialog } from './SendTestSmsDialog';
import { VariableInsertToolbar } from './VariableInsertToolbar';
import { TemplatePreview } from './TemplatePreview';
import type { NotificationTemplate, TemplateFormData, TemplateFormErrors } from '../types';
import { TEMPLATE_VARIABLES } from '../types';

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
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showTestSmsDialog, setShowTestSmsDialog] = useState(false);
  const [showImageLibrary, setShowImageLibrary] = useState(false);

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

  const insertAtCursor = useCallback((text: string) => {
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
  }, [form.body, updateField]);

  const handleInsertVariable = useCallback((variable: string) => {
    insertAtCursor(variable);
  }, [insertAtCursor]);

  const handleInsertImage = useCallback((placeholderKey: string) => {
    insertAtCursor(`{{image:${placeholderKey}}}`);
  }, [insertAtCursor]);

  // Single source of truth for channel-based conditions — Images, Preview, Send Test all
  // depend on this. Avoids divergence if code is later refactored.
  const isEmailChannel = template?.channel === 'EMAIL';

  // Fall back to template.body until the useEffect syncs form state, so the preview
  // starts fetching on the first render when the drawer opens.
  const { preview: livePreview, isLoading: previewLoading } = useTemplatePreview(
    template?.code ?? '',
    template?.channel ?? '',
    form.body || template?.body || '',
    form.subject || template?.subject || '',
    template?.tenantId,
  );

  const templateVarSpec = template ? TEMPLATE_VARIABLES[template.code as keyof typeof TEMPLATE_VARIABLES] : undefined;
  const canonicalRequired: string[] = templateVarSpec ? [...templateVarSpec.required] : template?.requiredVariables ?? [];
  const canonicalAllowed: readonly string[] | undefined = templateVarSpec
    ? [...templateVarSpec.required, ...templateVarSpec.optional]
    : undefined;

  const handleSubmit = useCallback(async () => {
    if (!template) return;

    const validationErrors = validate(form, canonicalRequired, canonicalAllowed);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await save(template.code, template.channel, form, template.tenantId);
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

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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
                  {canonicalRequired.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-text-muted">Required Variables</span>
                      <p className="text-sm text-text-primary">
                        {canonicalRequired.map((v) => `{{${v}}}`).join(', ')}
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
                    onOpenImages={isEmailChannel ? () => setShowImageLibrary(true) : undefined}
                    disabled={isSaving}
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

              {template && (
                <TemplatePreview
                  subject={livePreview?.subjectRendered ?? form.subject}
                  htmlRendered={livePreview?.htmlRendered ?? ''}
                  channel={template.channel}
                  isLoading={previewLoading}
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
                <Button variant="secondary" onClick={() => setShowTestDialog(true)} disabled={isSaving}>
                  Send Test Email
                </Button>
              )}
              {template?.channel === 'SMS' && (
                <Button variant="secondary" onClick={() => setShowTestSmsDialog(true)} disabled={isSaving}>
                  Send Test SMS
                </Button>
              )}
              <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                Save
              </Button>
            </FormActions>
          </div>
        </div>
      </DrawerPanel>

      {isEmailChannel && template && (
        <SendTestEmailDialog
          open={showTestDialog}
          onClose={() => setShowTestDialog(false)}
          templateCode={template.code}
          channel={template.channel}
        />
      )}
      {template?.channel === 'SMS' && (
        <SendTestSmsDialog
          open={showTestSmsDialog}
          onClose={() => setShowTestSmsDialog(false)}
          templateCode={template.code}
          channel={template.channel}
        />
      )}

      {showImageLibrary && (
        <ImageLibraryModal
          open={showImageLibrary}
          onClose={() => setShowImageLibrary(false)}
          onInsert={handleInsertImage}
          tenantId={template?.tenantId}
        />
      )}

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
