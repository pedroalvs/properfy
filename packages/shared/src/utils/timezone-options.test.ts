import { describe, expect, it } from 'vitest';
import { getTimezoneOptions, normalizeTimezoneQuery } from './timezone-options';

describe('getTimezoneOptions', () => {
  const options = getTimezoneOptions();

  it('returns a non-trivial list of IANA zones', () => {
    expect(options.length).toBeGreaterThan(100);
    expect(options.map((o) => o.value)).toContain('Australia/Sydney');
  });

  it('shapes each option with value, city, region, offsetLabel and searchText', () => {
    const sydney = options.find((o) => o.value === 'Australia/Sydney');
    expect(sydney).toBeDefined();
    expect(sydney?.city).toBe('Sydney');
    expect(sydney?.region).toBe('Australia');
    expect(sydney?.offsetLabel).toMatch(/^GMT[+-]\d{1,2}(?::\d{2})?$/);
    expect(sydney?.searchText).toContain('sydney');
  });

  it('pins the Australia region first, with remaining regions alphabetical', () => {
    const regions = [...new Set(options.map((o) => o.region))];
    expect(regions[0]).toBe('Australia');
    const rest = regions.slice(1);
    expect(rest).toEqual([...rest].sort());
  });

  it('sorts cities alphabetically within a region', () => {
    const cities = options.filter((o) => o.region === 'Australia').map((o) => o.city);
    expect(cities).toEqual([...cities].sort());
  });

  it('replaces underscores in the city label', () => {
    const lordHowe = options.find((o) => o.value === 'Australia/Lord_Howe');
    expect(lordHowe?.city).toBe('Lord Howe');
  });

  it('memoizes: repeated calls return the same array instance', () => {
    expect(getTimezoneOptions()).toBe(options);
  });
});

describe('normalizeTimezoneQuery', () => {
  it('lowercases and collapses separators', () => {
    expect(normalizeTimezoneQuery('America/Sao_Paulo')).toBe('america sao paulo');
  });

  it('strips diacritics so "são paulo" matches Sao_Paulo searchText', () => {
    const options = getTimezoneOptions();
    const saoPaulo = options.find((o) => o.value === 'America/Sao_Paulo');
    expect(saoPaulo?.searchText).toContain(normalizeTimezoneQuery('são paulo'));
  });

  it('trims and collapses internal whitespace', () => {
    expect(normalizeTimezoneQuery('  new    york ')).toBe('new york');
  });
});
