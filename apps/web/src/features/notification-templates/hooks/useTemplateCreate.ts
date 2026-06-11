import { useCallback } from 'react';
import { useTemplateSave, type SaveResult } from './useTemplateSave';
import {
  EMPTY_TEMPLATE_CREATE_FORM,
  inferChannelFromCode,
  type NotificationTemplate,
  type TemplateFormData,
  type TemplateFormErrors,
} from '../types';

/**
 * Seeds the create form from the platform default for a given code, so an agency
 * edits a copy rather than starting blank. Returns an empty form when no default
 * exists for that code. Pure — reads from the already-loaded list, no fetch.
 */
export function prefillFromDefault(
  code: string,
  platformDefaults: NotificationTemplate[],
): TemplateFormData {
  const base = platformDefaults.find((t) => t.tenantId === null && t.code === code);
  if (!base) return { ...EMPTY_TEMPLATE_CREATE_FORM };
  return { subject: base.subject, body: base.body, active: true };
}

export interface UseTemplateCreateReturn {
  /** Creates an override via the upsert endpoint (channel derived from the code). */
  save: (code: string, tenantId: string, data: TemplateFormData) => Promise<SaveResult>;
  isSaving: boolean;
  validationErrors: TemplateFormErrors;
  validate: (data: TemplateFormData, requiredVariables: string[], allowedVariables?: readonly string[]) => TemplateFormErrors;
}

export function useTemplateCreate(): UseTemplateCreateReturn {
  const { save: saveTemplate, isSaving, validate, validationErrors } = useTemplateSave();

  const save = useCallback(
    (code: string, tenantId: string, data: TemplateFormData): Promise<SaveResult> =>
      saveTemplate(code, inferChannelFromCode(code), data, tenantId),
    [saveTemplate],
  );

  return { save, isSaving, validationErrors, validate };
}
