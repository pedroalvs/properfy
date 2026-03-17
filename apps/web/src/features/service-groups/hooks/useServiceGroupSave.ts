import { useState, useCallback } from 'react';
import { ServiceGroupStatus } from '@properfy/shared';
import type { PriorityMode } from '@properfy/shared';
import type { ServiceGroupFormData, ServiceGroupFormErrors } from '../types';
import { MOCK_SERVICE_GROUPS } from '../mocks/service-groups';

const REQUIRED_FIELD_MESSAGE = 'Campo obrigatório';

const REQUIRED_FIELDS: (keyof ServiceGroupFormData)[] = ['name', 'priorityMode'];

function validateRequired(data: ServiceGroupFormData, fields: (keyof ServiceGroupFormData)[]): ServiceGroupFormErrors {
  const errors: ServiceGroupFormErrors = {};
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && !value.trim()) {
      errors[field] = REQUIRED_FIELD_MESSAGE;
    }
  }
  return errors;
}

export interface UseServiceGroupSaveReturn {
  save: (data: ServiceGroupFormData, serviceGroupId?: string) => Promise<boolean>;
  isSaving: boolean;
  validate: (data: ServiceGroupFormData, mode: 'create' | 'edit') => ServiceGroupFormErrors;
}

export function useServiceGroupSave(): UseServiceGroupSaveReturn {
  const [isSaving, setIsSaving] = useState(false);

  const validate = useCallback((data: ServiceGroupFormData, _mode: 'create' | 'edit'): ServiceGroupFormErrors => {
    const errors: ServiceGroupFormErrors = {};
    Object.assign(errors, validateRequired(data, REQUIRED_FIELDS));
    return errors;
  }, []);

  const save = useCallback(async (data: ServiceGroupFormData, serviceGroupId?: string): Promise<boolean> => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 400));

    if (serviceGroupId) {
      const idx = MOCK_SERVICE_GROUPS.findIndex((sg) => sg.id === serviceGroupId);
      if (idx !== -1) {
        const existing = MOCK_SERVICE_GROUPS[idx]!;
        MOCK_SERVICE_GROUPS[idx] = {
          ...existing,
          name: data.name,
          regionName: data.regionName || null,
          priorityMode: (data.priorityMode || existing.priorityMode) as PriorityMode,
          description: data.description || null,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      MOCK_SERVICE_GROUPS.push({
        id: `sg-${Date.now()}`,
        tenantId: 't-1',
        name: data.name,
        regionName: data.regionName || null,
        inspectorId: null,
        inspectorName: null,
        status: ServiceGroupStatus.DRAFT,
        priorityMode: data.priorityMode as PriorityMode,
        appointmentsCount: 0,
        appointmentCodes: [],
        description: data.description || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    setIsSaving(false);
    return true;
  }, []);

  return { save, isSaving, validate };
}
