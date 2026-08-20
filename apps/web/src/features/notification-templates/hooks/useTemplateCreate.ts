import { useCallback } from 'react';
import { useTemplateSave, type SaveResult, type UseTemplateSaveReturn } from './useTemplateSave';
import {
  inferChannelFromCode,
  type TemplateFormData,
  type TemplateFormErrors,
} from '../types';

// Prefill of the create form now goes through GET .../default (see
// TemplateCreateDrawer.handleCodeChange) — the old list-cache-based
// prefillFromDefault could seed from a filtered or stale list.

export interface UseTemplateCreateReturn {
  /** Creates an override via the upsert endpoint (channel derived from the code). */
  save: (code: string, tenantId: string, data: TemplateFormData) => Promise<SaveResult>;
  isSaving: boolean;
  validationErrors: TemplateFormErrors;
  /** Re-exported from useTemplateSave — see there for the `channel` default. */
  validate: UseTemplateSaveReturn['validate'];
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
