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
import { useTemplateDefault } from '../hooks/useTemplateDefault';
import { NotificationTargetChip } from './NotificationTargetChip';
import { SendTestEmailDialog } from './SendTestEmailDialog';
import { SendTestSmsDialog } from './SendTestSmsDialog';
import { VariableInsertToolbar } from './VariableInsertToolbar';
import { TemplatePreview } from './TemplatePreview';
import type { NotificationTemplate, TemplateFormData, TemplateFormErrors } from '../types';
import { TEMPLATE_VARIABLES, MANDATORY_TEMPLATE_CODES } from '../types';

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
  const { fetchDefault, isLoading: isResetting } = useTemplateDefault();
  const { showSuccess, showError } = useSnackbar();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [form, setForm] = useState<TemplateFormData>({ subject: '', body: '', active: true });
  const [initialData, setInitialData] = useState<TemplateFormData>({ subject: '', body: '', active: true });
  const [errors, setErrors] = useState<TemplateFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showTestSmsDialog, setShowTestSmsDialog] = useState(false);

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

  // Never show an empty editor. A blank Body means the row carries no content
  // for this channel, so fall back to the standard copy rather than presenting a
  // box that would silently save nothing.
  //
  // The ref claims the template id before fetching, which stops a re-render from
  // firing a second request — an effect that can re-trigger its own dependency is
  // the PR #961 freeze pattern. It is cleared when the drawer closes (this
  // component stays mounted across open/close, so a ref that only ever grew
  // would auto-fill once and show a blank box on every later visit) and released
  // on failure so a transient error does not disable auto-fill until reload.
  const autoFillRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      autoFillRef.current = null;
      return;
    }
    if (!template || template.body.trim()) return;
    if (autoFillRef.current === template.id) return;

    autoFillRef.current = template.id;
    let cancelled = false;
    void fetchDefault(template.code, template.channel, template.tenantId).then((result) => {
      if (cancelled) return;
      if (!result) {
        autoFillRef.current = null;
        return;
      }
      // Only the empty field is filled — an operator's saved subject is content,
      // not a gap to paper over.
      const applied = (prev: TemplateFormData): TemplateFormData => ({
        ...prev,
        subject: prev.subject.trim() ? prev.subject : result.subject ?? '',
        body: result.body,
      });
      // initialData moves too: filling a blank field with the standard content is
      // not an operator edit, so closing untouched must not prompt to discard.
      setForm(applied);
      setInitialData(applied);
    });
    return () => {
      cancelled = true;
    };
  }, [open, template, fetchDefault]);

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

  // Single source of truth for channel-based conditions — Preview and Send Test
  // depend on this. Avoids divergence if code is later refactored.
  const isEmailChannel = template?.channel === 'EMAIL';

  // The list also shows platform rows for codes outside the mandatory catalog
  // (PASSWORD_RESET, INSPECTION_STUCK_ALERT, ...). GetTemplateDefaultUseCase
  // rejects those, so the button would only ever produce an error.
  const canResetToDefault =
    template !== null &&
    (MANDATORY_TEMPLATE_CODES as readonly string[]).includes(template.code);

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

    const validationErrors = validate(form, canonicalRequired, canonicalAllowed, template.channel);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const result = await save(template.code, template.channel, form, template.tenantId);
    if (result.success) {
      showSuccess('Template updated successfully');
      onSaved();
    } else {
      if (result.fieldErrors) {
        setErrors((prev) => ({ ...prev, ...result.fieldErrors }));
      }
      if (result.error || !result.fieldErrors) {
        showError(result.error ?? 'Failed to save template');
      }
    }
  }, [template, form, validate, save, showSuccess, showError, onSaved]);

  /**
   * Load the standard content into the form. Deliberately does NOT touch
   * `initialData`, so the change registers as dirty and both the Save button and
   * the discard guard behave as they would for a hand edit — a reset is staged,
   * never persisted on its own.
   */
  const applyDefault = useCallback(async () => {
    setShowResetConfirm(false);
    if (!template) return;

    const result = await fetchDefault(template.code, template.channel, template.tenantId);
    if (!result) {
      showError('Could not load the default template. Your changes were kept.');
      return;
    }

    setForm((prev) => ({ ...prev, subject: result.subject ?? '', body: result.body }));
    setErrors({});
  }, [template, fetchDefault, showError]);

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
                  <div>
                    <span className="text-xs font-semibold text-text-muted">Target</span>
                    <p className="text-sm">
                      <NotificationTargetChip templateCode={template.code} />
                    </p>
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
                {/* SMS has no subject line — the column stays null for those
                    templates, so showing an "Email subject line" box on an SMS
                    row only invited input that would be discarded. */}
                {isEmailChannel && (
                  <FormField label="Subject" error={errors.subject}>
                    <TextInput
                      value={form.subject}
                      onChange={(v) => updateField('subject', v)}
                      placeholder="Email subject line"
                      error={!!errors.subject}
                      aria-label="Subject"
                    />
                  </FormField>
                )}

                <div className="flex flex-col gap-2">
                  <VariableInsertToolbar
                    onInsert={handleInsertVariable}
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
                        placeholder={
                          isEmailChannel
                            ? '<table>...</table>  Use {{variable}} for dynamic values'
                            : 'Plain text only. Use {{variable}} for dynamic values.'
                        }
                        rows={isEmailChannel ? 12 : 5}
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
              {canResetToDefault && (
                <Button
                  variant="secondary"
                  onClick={() => setShowResetConfirm(true)}
                  disabled={isSaving || isResetting}
                >
                  Reset to default
                </Button>
              )}
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

      {/* Copy names the level being restored: an agency override reverts to the
          platform default, while the platform default reverts to the template
          Properfy ships. */}
      <ConfirmDialog
        open={showResetConfirm}
        title="Reset to default?"
        message={
          template?.tenantId
            ? 'This replaces the content below with the platform default template. Your changes are only discarded once you save.'
            : 'This replaces the content below with the standard Properfy template. Your changes are only discarded once you save.'
        }
        confirmLabel="Reset"
        cancelLabel="Keep editing"
        variant="warning"
        onConfirm={applyDefault}
        onClose={() => setShowResetConfirm(false)}
      />

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
