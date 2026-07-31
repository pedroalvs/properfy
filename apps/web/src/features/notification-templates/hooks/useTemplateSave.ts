import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import {
  findTemplateVariableIssues,
  type NotificationChannel,
  type NotificationClass,
} from '@properfy/shared';
import { mapServerFieldErrors } from '@/lib/server-field-errors';
import { ALLOWED_VARIABLES, type TemplateFormData, type TemplateFormErrors } from '../types';

export interface SaveResult {
  success: boolean;
  error?: string;
  /** Backend VALIDATION_ERROR details mapped to form fields (inline display). */
  fieldErrors?: TemplateFormErrors;
}

/** API payload keys → form field keys (`bodyHtml` is edited as `body`). */
function templateFieldMapper(path: string): keyof TemplateFormErrors | undefined {
  if (path === 'subject') return 'subject';
  if (path === 'bodyHtml' || path === 'body') return 'body';
  return undefined;
}

export interface UseTemplateSaveReturn {
  save: (
    code: string,
    channel: NotificationChannel,
    data: TemplateFormData,
    tenantId?: string | null,
    notificationClass?: NotificationClass,
  ) => Promise<SaveResult>;
  isSaving: boolean;
  validationErrors: TemplateFormErrors;
  /**
   * `channel` defaults to EMAIL deliberately: EMAIL carries the stricter rule
   * (it also requires a subject), so a caller that forgets to pass it fails
   * closed rather than silently skipping validation.
   */
  validate: (
    data: TemplateFormData,
    requiredVariables: string[],
    allowedVariables?: readonly string[],
    channel?: NotificationChannel,
  ) => TemplateFormErrors;
}

function validateTemplate(
  data: TemplateFormData,
  requiredVariables: string[],
  allowedVariables?: readonly string[],
  channel: NotificationChannel = 'EMAIL',
): TemplateFormErrors {
  const errors: TemplateFormErrors = {};

  // A body is always required. The previous rule only fired when subject AND
  // body were both empty, so a template could be saved with nothing to deliver —
  // an empty SMS then failed at send time (EMPTY_SMS_BODY), far from the editor.
  if (!data.body.trim()) {
    errors.body = 'Body is required';
  }

  // SMS has no subject line; the column stays null for those templates.
  if (channel === 'EMAIL' && !data.subject.trim()) {
    errors.subject = 'Subject is required';
  }

  if (errors.body || errors.subject) {
    return errors;
  }

  if (/<[^>]+>/.test(data.subject)) {
    errors.subject = 'HTML is not allowed in the subject line';
  }

  // Handlebars-aware extraction lives in @properfy/shared so the backend can pin
  // the shipped catalog against this exact rule. A local `{{(\w+)}}` regex used to
  // read `{{else}}` as a variable, which made every appointment email unsaveable.
  const { invalid, missing } = findTemplateVariableIssues(`${data.subject} ${data.body}`, {
    required: requiredVariables,
    allowed: allowedVariables ?? ALLOWED_VARIABLES,
  });

  if (invalid.length > 0) {
    const errorMsg = `Invalid variables: ${invalid.join(', ')}`;
    errors.body = errors.body ? `${errors.body}. ${errorMsg}` : errorMsg;
  }

  if (missing.length > 0) {
    const missingMsg = `Missing required variables: ${missing.join(', ')}`;
    errors.body = errors.body ? `${errors.body}. ${missingMsg}` : missingMsg;
  }

  return errors;
}

export function useTemplateSave(): UseTemplateSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<TemplateFormErrors>({});
  const queryClient = useQueryClient();

  const validate = useCallback((
    data: TemplateFormData,
    requiredVariables: string[],
    allowedVariables?: readonly string[],
    channel?: NotificationChannel,
  ): TemplateFormErrors => {
    return validateTemplate(data, requiredVariables, allowedVariables, channel);
  }, []);

  const save = useCallback(async (
    code: string,
    channel: NotificationChannel,
    data: TemplateFormData,
    tenantId?: string | null,
    notificationClass?: NotificationClass,
  ): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (api as any).PUT(
        `/v1/notification-templates/${code}/${channel}`,
        {
          body: {
            subject: data.subject || undefined,
            bodyHtml: data.body,
            isActive: data.active,
            // Target the correct scope: an agency override (tenantId set) vs the
            // platform default (null → omitted). Without this, AM/OP editing an
            // override would silently overwrite the platform default.
            tenantId: tenantId ?? undefined,
            // Echo the stored classification. Omitting it made the backend fall
            // back to getDefaultClass on every edit, so a template classified as
            // MARKETING silently reverted to OPERATIONAL on the next save.
            notificationClass,
          },
        },
      );
      if (error) {
        return { success: false, ...mapServerFieldErrors(error, templateFieldMapper, 'Request failed') };
      }
      setValidationErrors({});
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, [queryClient]);

  return { save, isSaving, validationErrors, validate };
}
