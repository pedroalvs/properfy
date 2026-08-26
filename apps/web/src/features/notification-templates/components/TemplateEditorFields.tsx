import { useCallback, useRef } from 'react';
import type { NotificationChannel } from '@properfy/shared';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { VariableInsertToolbar } from './VariableInsertToolbar';
import type { TemplateFormData, TemplateFormErrors } from '../types';

interface TemplateEditorFieldsProps {
  form: TemplateFormData;
  errors: TemplateFormErrors;
  updateField: <K extends keyof TemplateFormData>(field: K, value: TemplateFormData[K]) => void;
  /** null while the create drawer has no code selected yet (renders as EMAIL). */
  channel: NotificationChannel | null;
  /** Variables offered by the toolbar (canonical allowed set for the code). */
  variables?: readonly string[];
  toolbarDisabled?: boolean;
}

/**
 * Subject + variable toolbar + body — shared by the edit and create drawers.
 *
 * Variable insertion works two ways:
 * - Click: inserts at the cursor of the last-focused field (subject or body).
 * - Drag & drop: the toolbar chips carry a text/plain payload, so the browser
 *   natively drops `{{var}}` at the exact caret position inside either field
 *   and the resulting input event flows through React onChange.
 */
export function TemplateEditorFields({
  form,
  errors,
  updateField,
  channel,
  variables,
  toolbarDisabled,
}: TemplateEditorFieldsProps) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // null until the operator focuses a field — an unfocused textarea reports
  // selectionStart 0, so inserting "at the cursor" before any focus would
  // prepend; appending to the body is the sensible default instead.
  const lastFocusedRef = useRef<'subject' | 'body' | null>(null);

  const isEmailChannel = channel !== 'SMS';

  const insertVariable = useCallback(
    (text: string) => {
      if (lastFocusedRef.current === null) {
        updateField('body', form.body + text);
        return;
      }
      const target =
        lastFocusedRef.current === 'subject' && isEmailChannel ? subjectRef.current : bodyRef.current;
      const field: 'subject' | 'body' =
        lastFocusedRef.current === 'subject' && isEmailChannel ? 'subject' : 'body';
      const current = form[field];

      if (target) {
        const start = target.selectionStart ?? current.length;
        const end = target.selectionEnd ?? current.length;
        updateField(field, current.substring(0, start) + text + current.substring(end));
        requestAnimationFrame(() => {
          const cursorPos = start + text.length;
          target.focus();
          target.setSelectionRange(cursorPos, cursorPos);
        });
      } else {
        updateField(field, current + text);
      }
    },
    [form, isEmailChannel, updateField],
  );

  const bodyContainerClass = errors.body
    ? 'rounded border border-error bg-white shadow-[inset_0_-1px_0_0_var(--color-error)]'
    : 'rounded border border-[#E0E0E0] bg-white shadow-[inset_0_-1px_0_0_#E0E0E0] focus-within:border-primary';

  return (
    <>
      {/* SMS has no subject line — the column stays null for those templates,
          so showing an "Email subject line" box on an SMS row only invited
          input that would be discarded. */}
      {isEmailChannel && (
        <FormField label="Subject" error={errors.subject}>
          <TextInput
            ref={subjectRef}
            value={form.subject}
            onChange={(v) => updateField('subject', v)}
            onFocus={() => {
              lastFocusedRef.current = 'subject';
            }}
            placeholder="Email subject line"
            error={!!errors.subject}
            aria-label="Subject"
          />
        </FormField>
      )}

      <div className="flex flex-col gap-2">
        <VariableInsertToolbar
          onInsert={insertVariable}
          disabled={toolbarDisabled}
          variables={variables}
        />
        <FormField label="Body" error={errors.body}>
          <div className={bodyContainerClass}>
            <textarea
              ref={bodyRef}
              value={form.body}
              onChange={(e) => updateField('body', e.target.value)}
              onFocus={() => {
                lastFocusedRef.current = 'body';
              }}
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
    </>
  );
}
