import { useState, useCallback } from 'react';
import { contactSchema, InspectorStatus } from '@properfy/shared';
import type { InspectorFormData, InspectorFormErrors } from '../types';
import { MOCK_INSPECTORS } from '../mocks/inspectors';

const REQUIRED_FIELD_MESSAGE = 'Campo obrigatório';

const REQUIRED_FIELDS: (keyof InspectorFormData)[] = ['name', 'email'];

function validateRequired(data: InspectorFormData, fields: (keyof InspectorFormData)[]): InspectorFormErrors {
  const errors: InspectorFormErrors = {};
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && !value.trim()) {
      errors[field] = REQUIRED_FIELD_MESSAGE;
    }
  }
  return errors;
}

function validateEmail(email: string): string | undefined {
  if (!email) return undefined;
  const result = contactSchema.shape.primaryEmail.safeParse(email);
  if (!result.success) return 'E-mail inválido';
  return undefined;
}

function splitComma(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export interface UseInspectorSaveReturn {
  save: (data: InspectorFormData, inspectorId?: string) => Promise<boolean>;
  isSaving: boolean;
  validate: (data: InspectorFormData, mode: 'create' | 'edit') => InspectorFormErrors;
}

export function useInspectorSave(): UseInspectorSaveReturn {
  const [isSaving, setIsSaving] = useState(false);

  const validate = useCallback((data: InspectorFormData, _mode: 'create' | 'edit'): InspectorFormErrors => {
    const errors: InspectorFormErrors = {};

    Object.assign(errors, validateRequired(data, REQUIRED_FIELDS));

    const emailError = validateEmail(data.email);
    if (emailError) errors.email = emailError;

    return errors;
  }, []);

  const save = useCallback(async (data: InspectorFormData, inspectorId?: string): Promise<boolean> => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const regions = splitComma(data.regions);
    const serviceTypes = splitComma(data.serviceTypes);

    if (inspectorId) {
      const idx = MOCK_INSPECTORS.findIndex((i) => i.id === inspectorId);
      if (idx !== -1) {
        const existing = MOCK_INSPECTORS[idx]!;
        MOCK_INSPECTORS[idx] = {
          ...existing,
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          document: data.document || null,
          status: (data.status || existing.status) as InspectorStatus,
          regions,
          serviceTypes,
          regionsCount: regions.length,
          serviceTypesCount: serviceTypes.length,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      MOCK_INSPECTORS.push({
        id: `insp-${Date.now()}`,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        document: data.document || null,
        status: InspectorStatus.ACTIVE,
        rating: null,
        regions,
        serviceTypes,
        regionsCount: regions.length,
        serviceTypesCount: serviceTypes.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    setIsSaving(false);
    return true;
  }, []);

  return { save, isSaving, validate };
}
