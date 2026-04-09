import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

type FilterType = 'string' | 'number' | 'boolean';

export interface FilterSchema {
  [key: string]: { type: FilterType; default: unknown };
}

type FilterValues<T extends FilterSchema> = {
  [K in keyof T]: T[K]['type'] extends 'string'
    ? string
    : T[K]['type'] extends 'number'
      ? number
      : boolean;
};

function deserialize(value: string | null, type: FilterType, defaultValue: unknown): unknown {
  if (value === null || value === undefined || value === '') return defaultValue;
  if (type === 'number') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }
  if (type === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return defaultValue;
  }
  return value;
}

function serialize(value: unknown, type: FilterType): string {
  if (value === null || value === undefined) return '';
  if (type === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

const DEBOUNCE_MS = 300;

export function useUrlFilters<T extends FilterSchema>(
  schema: T,
): [FilterValues<T>, (key: keyof T, value: unknown) => void, () => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<URLSearchParams | null>(null);

  const filters = useMemo(() => {
    const result: Record<string, unknown> = {};
    for (const [key, config] of Object.entries(schema)) {
      result[key] = deserialize(searchParams.get(key), config.type, config.default);
    }
    return result as FilterValues<T>;
  }, [searchParams, schema]);

  const flushToUrl = useCallback(
    (params: URLSearchParams) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      pendingRef.current = params;
      timeoutRef.current = setTimeout(() => {
        if (pendingRef.current) {
          setSearchParams(pendingRef.current, { replace: true });
          pendingRef.current = null;
        }
      }, DEBOUNCE_MS);
    },
    [setSearchParams],
  );

  const setFilter = useCallback(
    (key: keyof T, value: unknown) => {
      const newParams = new URLSearchParams(pendingRef.current ?? searchParams);
      const config = schema[key as string]!;
      const serialized = serialize(value, config.type);
      const defaultSerialized = serialize(config.default, config.type);

      if (serialized === defaultSerialized || serialized === '') {
        newParams.delete(key as string);
      } else {
        newParams.set(key as string, serialized);
      }

      flushToUrl(newParams);
    },
    [searchParams, schema, flushToUrl],
  );

  const clearFilters = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pendingRef.current = null;
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return [filters, setFilter, clearFilters];
}
