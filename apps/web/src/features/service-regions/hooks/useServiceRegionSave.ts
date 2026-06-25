import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import type { ServiceRegionFormData, ServiceRegionFormErrors } from '../types';

const REQUIRED_FIELD_MESSAGE = 'Required field';

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface UseServiceRegionSaveReturn {
  save: (data: ServiceRegionFormData, regionId?: string) => Promise<SaveResult>;
  isSaving: boolean;
  validate: (data: ServiceRegionFormData) => ServiceRegionFormErrors;
}

export function useServiceRegionSave(): UseServiceRegionSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const validate = useCallback((data: ServiceRegionFormData): ServiceRegionFormErrors => {
    const errors: ServiceRegionFormErrors = {};
    if (!data.name.trim()) {
      errors.name = REQUIRED_FIELD_MESSAGE;
    }
    if (!data.geojson || !hasCoordinates(data.geojson)) {
      errors.geojson = 'A polygon must be drawn on the map';
    }
    return errors;
  }, []);

  const save = useCallback(async (data: ServiceRegionFormData, regionId?: string): Promise<SaveResult> => {
    setIsSaving(true);
    try {
      const payload = {
        name: data.name.trim(),
        geojson: data.geojson,
        color: data.color,
        ...(regionId ? { status: data.status || undefined } : {}),
      };

      if (regionId) {
        const { error } = await api.PATCH(`/v1/service-regions/${regionId}` as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      } else {
        const { error } = await api.POST('/v1/service-regions' as any, { body: payload as any });
        if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      }
      queryClient.invalidateQueries({ queryKey: ['service-regions'] });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      return { success: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, [queryClient]);

  return { save, isSaving, validate };
}

function hasCoordinates(geojson: object): boolean {
  const geo = geojson as { type?: string; coordinates?: unknown[][] };
  return (
    geo.type === 'Polygon' &&
    Array.isArray(geo.coordinates) &&
    geo.coordinates.length > 0 &&
    Array.isArray(geo.coordinates[0]) &&
    geo.coordinates[0].length >= 4
  );
}
