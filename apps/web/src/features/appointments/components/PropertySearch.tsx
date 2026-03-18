import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import {
  filterContainer,
  filterLabel,
  filterLabelFocused,
  filterIcon,
  filterDropdown,
  filterOption,
  filterOptionActive,
} from '@/components/filters/filter-styles';
import type { Property } from '@/features/properties/types';
import type { PaginatedResponse } from '@/hooks/useApiQuery';

interface PropertySearchProps {
  value: string;
  onChange: (propertyId: string) => void;
  label?: string;
  placeholder?: string;
}

interface PropertySearchResult {
  id: string;
  street: string;
  suburb: string;
  postcode: string;
  type: string;
  branchName: string | null;
}

function usePropertySearch(search: string) {
  return useQuery<PropertySearchResult[], ApiError>({
    queryKey: ['properties', 'search', search],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/properties' as any, {
        params: { query: { search, pageSize: '10' } as any },
      });
      if (error) throw new ApiError((error as any).status ?? 500, (error as any).message ?? 'Failed to search properties');
      const response = data as unknown as PaginatedResponse<Property>;
      return response.data.map((p) => ({
        id: p.id,
        street: p.street,
        suburb: p.suburb,
        postcode: p.postcode,
        type: p.type,
        branchName: p.branchName,
      }));
    },
    enabled: search.length >= 3,
    staleTime: 30_000,
  });
}

function usePropertyDetail(propertyId: string) {
  return useQuery<PropertySearchResult | null, ApiError>({
    queryKey: ['properties', 'selected', propertyId],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/properties' as any, {
        params: { query: { search: '', pageSize: '50' } as any },
      });
      if (error) return null;
      const response = data as unknown as PaginatedResponse<Property>;
      const match = response.data.find((p) => p.id === propertyId);
      if (!match) return null;
      return {
        id: match.id,
        street: match.street,
        suburb: match.suburb,
        postcode: match.postcode,
        type: match.type,
        branchName: match.branchName,
      };
    },
    enabled: !!propertyId,
    staleTime: 60_000,
  });
}

function formatPropertyLabel(p: PropertySearchResult): string {
  return `${p.street}, ${p.suburb} ${p.postcode}`;
}

function formatPropertyType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PropertySearch({
  value,
  onChange,
  label = 'Property',
  placeholder = 'Search by address...',
}: PropertySearchProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: results = [], isLoading: isSearching } = usePropertySearch(debouncedSearch);
  const { data: selectedProperty } = usePropertyDetail(value);

  const showFloatingLabel = focused || open || value !== '' || search !== '';
  const selectedLabel = selectedProperty ? formatPropertyLabel(selectedProperty) : '';

  const handleSearchChange = useCallback((newSearch: string) => {
    setSearch(newSearch);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(newSearch);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
        if (!value) setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  return (
    <div ref={containerRef} className={filterContainer}>
      {showFloatingLabel && (
        <span className={focused || open ? filterLabelFocused : filterLabel}>{label}</span>
      )}
      <div className="flex items-center px-3">
        <i className={`mdi mdi-magnify ${filterIcon} mr-2`} />
        <input
          ref={inputRef}
          type="text"
          className="w-full bg-transparent py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
          placeholder={showFloatingLabel ? placeholder : label}
          value={open ? search : selectedLabel}
          onChange={(e) => {
            handleSearchChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
            setSearch('');
            setDebouncedSearch('');
          }}
          onBlur={() => {
            if (!open) setFocused(false);
          }}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          aria-autocomplete="list"
        />
        {value && (
          <button
            type="button"
            className="ml-1 text-text-muted hover:text-text-primary transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
              setSearch('');
              setDebouncedSearch('');
              inputRef.current?.focus();
            }}
            aria-label="Clear selection"
          >
            <i className="mdi mdi-close text-base" />
          </button>
        )}
      </div>

      {open && (
        <ul className={filterDropdown} role="listbox" aria-label={label}>
          {search.length > 0 && search.length < 3 ? (
            <li className="px-3 py-2 text-sm text-text-muted">Type at least 3 characters to search</li>
          ) : isSearching ? (
            <li className="px-3 py-2 text-sm text-text-muted">Searching...</li>
          ) : debouncedSearch.length >= 3 && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">No properties found</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">Start typing to search properties</li>
          ) : (
            results.map((property) => (
              <li
                key={property.id}
                role="option"
                aria-selected={property.id === value}
                className={property.id === value ? filterOptionActive : filterOption}
                onClick={() => {
                  onChange(property.id);
                  setSearch('');
                  setDebouncedSearch('');
                  setOpen(false);
                  setFocused(false);
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{formatPropertyLabel(property)}</span>
                  <span className="text-xs text-text-muted">
                    {formatPropertyType(property.type)}
                    {property.branchName && ` · ${property.branchName}`}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      )}

      {value && selectedProperty && !open && (
        <div className="px-3 pb-2 text-xs text-text-secondary">
          {formatPropertyType(selectedProperty.type)}
          {selectedProperty.branchName && ` · ${selectedProperty.branchName}`}
        </div>
      )}
    </div>
  );
}
