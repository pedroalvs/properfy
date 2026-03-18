import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { NotificationChannel } from '@properfy/shared';
import { ALLOWED_VARIABLES, type TemplateFormData, type TemplateFormErrors } from '../types';

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface UseTemplateSaveReturn {
  save: (code: string, channel: NotificationChannel, data: TemplateFormData) => Promise<SaveResult>;
  isSaving: boolean;
  validationErrors: TemplateFormErrors;
  validate: (data: TemplateFormData, requiredVariables: string[]) => TemplateFormErrors;
}

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;
const HTML_PATTERN = /[<>]/;

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

function validateTemplate(data: TemplateFormData, requiredVariables: string[]): TemplateFormErrors {
  const errors: TemplateFormErrors = {};

  if (!data.subject.trim() && !data.body.trim()) {
    errors.subject = 'Subject is required';
    errors.body = 'Body is required';
    return errors;
  }

  if (HTML_PATTERN.test(data.subject)) {
    errors.subject = 'HTML characters (< >) are not allowed';
  }

  if (HTML_PATTERN.test(data.body)) {
    errors.body = 'HTML characters (< >) are not allowed';
  }

  const allText = `${data.subject} ${data.body}`;
  const usedVariables = extractVariables(allText);
  const allowedSet = new Set<string>(ALLOWED_VARIABLES);
  const disallowed = usedVariables.filter((v) => !allowedSet.has(v));

  if (disallowed.length > 0) {
    const errorMsg = `Invalid variables: ${disallowed.join(', ')}`;
    if (!errors.body) {
      errors.body = errorMsg;
    } else {
      errors.body = `${errors.body}. ${errorMsg}`;
    }
  }

  const bodyVariables = extractVariables(data.body);
  const subjectVariables = extractVariables(data.subject);
  const allUsed = new Set([...bodyVariables, ...subjectVariables]);
  const missing = requiredVariables.filter((v) => !allUsed.has(v));

  if (missing.length > 0) {
    const missingMsg = `Missing required variables: ${missing.join(', ')}`;
    if (!errors.body) {
      errors.body = missingMsg;
    } else {
      errors.body = `${errors.body}. ${missingMsg}`;
    }
  }

  return errors;
}

export function useTemplateSave(): UseTemplateSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<TemplateFormErrors>({});
  const queryClient = useQueryClient();

  const validate = useCallback((data: TemplateFormData, requiredVariables: string[]): TemplateFormErrors => {
    return validateTemplate(data, requiredVariables);
  }, []);

  const save = useCallback(async (
    code: string,
    channel: NotificationChannel,
    data: TemplateFormData,
  ): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      const { error } = await api.PUT(
        `/v1/notification-templates/${code}/${channel}` as any,
        { body: data as any },
      );
      if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
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
