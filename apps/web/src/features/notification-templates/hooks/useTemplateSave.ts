import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { NotificationChannel } from '@properfy/shared';
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
  save: (code: string, channel: NotificationChannel, data: TemplateFormData, tenantId?: string | null) => Promise<SaveResult>;
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

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

function extractVariables(text: string): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(VARIABLE_PATTERN.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    if (match[1] && !matches.includes(match[1])) {
      matches.push(match[1]);
    }
  }
  return matches;
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

  const allText = `${data.subject} ${data.body}`;
  const usedVariables = extractVariables(allText);
  const allowedSet = new Set<string>(allowedVariables ?? ALLOWED_VARIABLES);
  const disallowed = usedVariables.filter((v) => !allowedSet.has(v));

  if (disallowed.length > 0) {
    const errorMsg = `Invalid variables: ${disallowed.join(', ')}`;
    errors.body = errors.body ? `${errors.body}. ${errorMsg}` : errorMsg;
  }

  const bodyVariables = extractVariables(data.body);
  const subjectVariables = extractVariables(data.subject);
  const allUsed = new Set([...bodyVariables, ...subjectVariables]);
  const missing = requiredVariables.filter((v) => !allUsed.has(v));

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
