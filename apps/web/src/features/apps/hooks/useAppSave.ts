import { useState, useCallback } from 'react';
import { appCredentialCreateSchema, appCredentialUpdateSchema } from '@properfy/shared';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { AppFormData, AppFormErrors } from '../types';

/** Shared optional fields — empty inputs are sent as null (clears on update). */
function toOptionalFields(data: AppFormData) {
  return {
    branchId: data.branchId || null,
    needsAuthCode: data.needsAuthCode,
    authCode: data.needsAuthCode && data.authCode ? data.authCode : null,
    appUrl: data.appUrl.trim() || null,
    instructionsUrl: data.instructionsUrl.trim() || null,
    instructionsPassword: data.instructionsPassword || null,
  };
}

function toCreatePayload(data: AppFormData) {
  return {
    tenantId: data.tenantId,
    name: data.name.trim(),
    username: data.username.trim(),
    password: data.password,
    ...toOptionalFields(data),
  };
}

function toUpdatePayload(data: AppFormData) {
  return {
    name: data.name.trim(),
    username: data.username.trim(),
    password: data.password,
    ...toOptionalFields(data),
  };
}

function zodErrorsToFormErrors(issues: { path: (string | number)[]; message: string; code?: string }[]): AppFormErrors {
  const errors: AppFormErrors = {};
  for (const issue of issues) {
    const key = issue.path[0] as keyof AppFormData | undefined;
    if (key && !errors[key]) {
      errors[key] = issue.code === 'invalid_type' || issue.message === 'Required' ? 'Required field' : issue.message;
    }
  }
  return errors;
}

export interface SaveResult {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  id?: string;
}

export interface UseAppSaveReturn {
  save: (data: AppFormData, appId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: AppFormData, mode: 'create' | 'edit') => AppFormErrors;
}

export function useAppSave(): UseAppSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: AppFormData, mode: 'create' | 'edit'): AppFormErrors => {
    const payload = mode === 'create' ? toCreatePayload(data) : toUpdatePayload(data);
    const schema = mode === 'create' ? appCredentialCreateSchema : appCredentialUpdateSchema;
    const result = schema.safeParse(payload);
    return result.success ? {} : zodErrorsToFormErrors(result.error.issues);
  }, []);

  const save = useCallback(async (data: AppFormData, appId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      let newId: string | undefined;
      if (appId) {
        const { error } = await api.PATCH(`/v1/app-credentials/${appId}` as any, { body: toUpdatePayload(data) as any });
        if (error) {
          return { success: false, errorCode: (error as any)?.error?.code, errorMessage: (error as any)?.error?.message ?? 'Request failed' };
        }
      } else {
        const { data: responseData, error } = await api.POST('/v1/app-credentials' as any, { body: toCreatePayload(data) as any });
        if (error) {
          return { success: false, errorCode: (error as any)?.error?.code, errorMessage: (error as any)?.error?.message ?? 'Request failed' };
        }
        newId = (responseData as any)?.data?.id;
      }
      queryClient.invalidateQueries({ queryKey: ['app-credentials'] });
      return { success: true, id: newId };
    } finally {
      setIsSaving(false);
    }
  }, [queryClient]);

  return { save, isSaving, validate };
}
