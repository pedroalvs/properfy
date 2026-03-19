import { useState, useCallback } from 'react';
import { createPropertySchema, updatePropertySchema } from '@properfy/shared';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import type { PropertyFormData, PropertyFormErrors } from '../types';

/** Map form data to the shape expected by the shared Zod schema. */
function toSchemaPayload(data: PropertyFormData, mode: 'create' | 'edit', tenantId?: string | null) {
  if (mode === 'create') {
    return {
      propertyCode: data.propertyCode.trim() || undefined,
      type: data.type || undefined,
      street: data.street.trim() || undefined,
      ...(data.addressLine2.trim() ? { addressLine2: data.addressLine2.trim() } : {}),
      suburb: data.suburb.trim() || undefined,
      postcode: data.postcode.trim() || undefined,
      state: data.state || undefined,
      country: data.country.trim() || 'AU',
      ...(data.branchId ? { branchId: data.branchId } : {}),
      ...(data.notes.trim() ? { notes: data.notes.trim() } : {}),
      ...(tenantId ? { tenantId } : {}),
    };
  }

  return {
    ...(data.propertyCode.trim() ? { propertyCode: data.propertyCode.trim() } : {}),
    ...(data.type ? { type: data.type } : {}),
    ...(data.street.trim() ? { street: data.street.trim() } : {}),
    addressLine2: data.addressLine2.trim() || null,
    ...(data.suburb.trim() ? { suburb: data.suburb.trim() } : {}),
    ...(data.postcode.trim() ? { postcode: data.postcode.trim() } : {}),
    ...(data.state ? { state: data.state } : {}),
    ...(data.country.trim() ? { country: data.country.trim() } : {}),
    branchId: data.branchId || null,
    notes: data.notes.trim() || null,
  };
}

function isRequiredError(issue: { code?: string; message: string }): boolean {
  return issue.code === 'invalid_type' || issue.message === 'Required';
}

function zodErrorsToFormErrors(issues: { path: (string | number)[]; message: string; code?: string }[]): PropertyFormErrors {
  const errors: PropertyFormErrors = {};
  for (const issue of issues) {
    const field = issue.path.join('.') as keyof PropertyFormData;
    if (field && !errors[field]) {
      errors[field] = isRequiredError(issue) ? 'Required field' : issue.message;
    }
  }
  return errors;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  id?: string;
}

export interface UsePropertySaveReturn {
  save: (data: PropertyFormData, propertyId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: PropertyFormData, mode: 'create' | 'edit') => PropertyFormErrors;
}

export function usePropertySave(): UsePropertySaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const validate = useCallback((data: PropertyFormData, mode: 'create' | 'edit'): PropertyFormErrors => {
    const payload = toSchemaPayload(data, mode);
    const schema = mode === 'create' ? createPropertySchema : updatePropertySchema;
    const result = schema.safeParse(payload);
    const errors: PropertyFormErrors = {};
    if (!result.success) {
      Object.assign(errors, zodErrorsToFormErrors(result.error.issues));
    }
    // The API update schema has all fields optional for partial updates,
    // but the form always requires address fields.
    if (mode === 'edit') {
      if (!data.street.trim()) errors.street = errors.street ?? 'Required field';
      if (!data.suburb.trim()) errors.suburb = errors.suburb ?? 'Required field';
      if (!data.postcode.trim()) errors.postcode = errors.postcode ?? 'Required field';
      if (!data.state) errors.state = errors.state ?? 'Required field';
    }
    return errors;
  }, []);

  const save = useCallback(async (data: PropertyFormData, propertyId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      let newId: string | undefined;
      if (propertyId) {
        const payload = toSchemaPayload(data, 'edit');
        const { error } = await api.PATCH(`/v1/properties/${propertyId}` as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const payload = toSchemaPayload(data, 'create', user?.tenantId);
        const { data: responseData, error } = await api.POST('/v1/properties' as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
        newId = (responseData as any)?.data?.id;
      }
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      return { success: true, id: newId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, [queryClient]);

  return { save, isSaving, validate };
}
