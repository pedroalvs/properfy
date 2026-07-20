import { useState, useCallback } from 'react';
import { createPropertySchema, updatePropertySchema, PropertyType } from '@properfy/shared';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { identityFieldMapper, mapServerFieldErrors } from '@/lib/server-field-errors';
import type { PropertyFormData, PropertyFormErrors } from '../types';
import { EMPTY_PROPERTY_FORM } from '../types';

/** Backend VALIDATION_ERROR detail paths mirror the flat property schema. */
const serverFieldMapper = identityFieldMapper(
  Object.keys(EMPTY_PROPERTY_FORM) as (keyof PropertyFormData)[],
);

function parseBoolField(value: '' | 'true' | 'false'): boolean | undefined {
  return value === '' ? undefined : value === 'true';
}

function parseNumberField(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Map form data to the shape expected by the shared Zod schema. */
function toSchemaPayload(data: PropertyFormData, mode: 'create' | 'edit', tenantId?: string | null) {
  if (mode === 'create') {
    return {
      ...(parseNumberField(data.privateAreaM2) !== undefined
        ? { privateAreaM2: parseNumberField(data.privateAreaM2) }
        : {}),
      ...(parseNumberField(data.totalAreaM2) !== undefined
        ? { totalAreaM2: parseNumberField(data.totalAreaM2) }
        : {}),
      ...(parseBoolField(data.furnished) !== undefined
        ? { furnished: parseBoolField(data.furnished) }
        : {}),
      ...(parseBoolField(data.linenProvided) !== undefined
        ? { linenProvided: parseBoolField(data.linenProvided) }
        : {}),
      ...(parseNumberField(data.rentAmount) !== undefined
        ? { rentAmount: parseNumberField(data.rentAmount) }
        : {}),
      type: data.type || undefined,
      ...(data.type === PropertyType.APARTMENT && data.apartmentNumber.trim()
        ? { apartmentNumber: data.apartmentNumber.trim() }
        : {}),
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

  const payload: Record<string, unknown> = {
    ...(data.type ? { type: data.type } : {}),
    // Only meaningful for apartments; clearing (or switching to HOUSE) nulls it.
    apartmentNumber:
      data.type === PropertyType.APARTMENT ? data.apartmentNumber.trim() || null : null,
    ...(data.street.trim() ? { street: data.street.trim() } : {}),
    addressLine2: data.addressLine2.trim() || null,
    ...(data.suburb.trim() ? { suburb: data.suburb.trim() } : {}),
    ...(data.postcode.trim() ? { postcode: data.postcode.trim() } : {}),
    ...(data.state ? { state: data.state } : {}),
    ...(data.country.trim() ? { country: data.country.trim() } : {}),
    branchId: data.branchId || null,
    // Edit sends explicit null so clearing a value actually clears it.
    privateAreaM2: parseNumberField(data.privateAreaM2) ?? null,
    totalAreaM2: parseNumberField(data.totalAreaM2) ?? null,
    furnished: parseBoolField(data.furnished) ?? null,
    linenProvided: parseBoolField(data.linenProvided) ?? null,
    rentAmount: parseNumberField(data.rentAmount) ?? null,
    notes: data.notes.trim() || null,
  };

  if (data.latitude.trim()) {
    payload.latitude = parseFloat(data.latitude.trim());
  }
  if (data.longitude.trim()) {
    payload.longitude = parseFloat(data.longitude.trim());
  }

  return payload;
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
  /** Backend VALIDATION_ERROR details mapped to form fields (inline display). */
  fieldErrors?: PropertyFormErrors;
  id?: string;
}

export interface UsePropertySaveReturn {
  save: (data: PropertyFormData, propertyId?: string, tenantIdOverride?: string) => Promise<SaveResult>;
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

  const save = useCallback(async (data: PropertyFormData, propertyId?: string, tenantIdOverride?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      let newId: string | undefined;
      if (propertyId) {
        const payload = toSchemaPayload(data, 'edit');
        const { error } = await api.PATCH(`/v1/properties/${propertyId}` as any, { body: payload as any });
        if (error) return { success: false, ...mapServerFieldErrors(error, serverFieldMapper, 'Request failed') };
      } else {
        const payload = toSchemaPayload(data, 'create', tenantIdOverride ?? user?.tenantId);
        const { data: responseData, error } = await api.POST('/v1/properties' as any, { body: payload as any });
        if (error) return { success: false, ...mapServerFieldErrors(error, serverFieldMapper, 'Request failed') };
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
  }, [queryClient, user?.tenantId]);

  return { save, isSaving, validate };
}
