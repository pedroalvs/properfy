import { useState, useCallback } from 'react';
import { GeocodingStatus } from '@properfy/shared';
import type { PropertyFormData, PropertyFormErrors } from '../types';
import type { PropertyDetail } from '../types';
import { MOCK_PROPERTIES } from '../mocks/properties';

const REQUIRED_FIELD_MESSAGE = 'Campo obrigatório';

const CREATE_REQUIRED_FIELDS: (keyof PropertyFormData)[] = [
  'propertyCode',
  'type',
  'street',
  'suburb',
  'postcode',
  'state',
];

const EDIT_REQUIRED_FIELDS: (keyof PropertyFormData)[] = [
  'street',
  'suburb',
  'postcode',
  'state',
];

function validateRequired(data: PropertyFormData, fields: (keyof PropertyFormData)[]): PropertyFormErrors {
  const errors: PropertyFormErrors = {};
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && !value.trim()) {
      errors[field] = REQUIRED_FIELD_MESSAGE;
    }
  }
  return errors;
}

export interface UsePropertySaveReturn {
  save: (data: PropertyFormData, propertyId?: string) => Promise<boolean>;
  isSaving: boolean;
  validate: (data: PropertyFormData, mode: 'create' | 'edit') => PropertyFormErrors;
}

export function usePropertySave(): UsePropertySaveReturn {
  const [isSaving, setIsSaving] = useState(false);

  const validate = useCallback((data: PropertyFormData, mode: 'create' | 'edit'): PropertyFormErrors => {
    const errors: PropertyFormErrors = {};

    if (mode === 'create') {
      Object.assign(errors, validateRequired(data, CREATE_REQUIRED_FIELDS));
    } else {
      Object.assign(errors, validateRequired(data, EDIT_REQUIRED_FIELDS));
    }

    return errors;
  }, []);

  const save = useCallback(async (data: PropertyFormData, propertyId?: string): Promise<boolean> => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 400));

    if (propertyId) {
      const idx = MOCK_PROPERTIES.findIndex((p) => p.id === propertyId);
      if (idx !== -1) {
        const existing = MOCK_PROPERTIES[idx]!;
        MOCK_PROPERTIES[idx] = {
          ...existing,
          type: data.type as PropertyDetail['type'],
          branchId: data.branchId || null,
          street: data.street,
          addressLine2: data.addressLine2 || null,
          suburb: data.suburb,
          postcode: data.postcode,
          state: data.state,
          country: data.country,
          notes: data.notes || null,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      const newProperty: PropertyDetail = {
        id: `prop-${Date.now()}`,
        propertyCode: `IMV-${String(MOCK_PROPERTIES.length + 1).padStart(3, '0')}`,
        tenantId: 'tenant-1',
        branchId: data.branchId || null,
        branchName: data.branchId === 'branch-1' ? 'Filial Centro' : data.branchId === 'branch-2' ? 'Filial Norte' : null,
        type: data.type as PropertyDetail['type'],
        street: data.street,
        addressLine2: data.addressLine2 || null,
        suburb: data.suburb,
        postcode: data.postcode,
        state: data.state,
        country: data.country,
        geocodingStatus: GeocodingStatus.PENDING,
        notes: data.notes || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        latitude: null,
        longitude: null,
      };
      MOCK_PROPERTIES.push(newProperty);
    }

    setIsSaving(false);
    return true;
  }, []);

  return { save, isSaving, validate };
}
