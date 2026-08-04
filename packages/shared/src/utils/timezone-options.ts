/**
 * Option list for timezone pickers (web + pwa). Built from the runtime's tzdb
 * via Intl.supportedValuesOf, with a small curated fallback for engines that
 * lack it. The Australia region is pinned first: the platform's domain is
 * AU-centric.
 */

export interface TimezoneOption {
  /** Canonical IANA identifier, e.g. 'Australia/Sydney'. */
  value: string;
  /** Human city label, e.g. 'Lord Howe'. */
  city: string;
  /** First path segment, e.g. 'Australia'. */
  region: string;
  /** Current UTC offset label, e.g. 'GMT+11'. DST-dependent snapshot at build time. */
  offsetLabel: string;
  /** Normalized haystack for filtering: value + city + offset, diacritics stripped. */
  searchText: string;
}

/** Curated fallback when Intl.supportedValuesOf is unavailable. */
const FALLBACK_ZONES = [
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/Berlin',
  'Europe/London',
];

/** Lowercase, strip diacritics, and collapse `_`/`/`/whitespace runs into single spaces. */
export function normalizeTimezoneQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_/\s]+/g, ' ')
    .trim();
}

function offsetLabelFor(timezone: string, referenceDate: Date): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  }).formatToParts(referenceDate);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  // 'GMT' (zero offset) normalizes to 'GMT+0' so every label has a sign.
  return name === 'GMT' ? 'GMT+0' : name;
}

function buildOption(zone: string, referenceDate: Date): TimezoneOption {
  const segments = zone.split('/');
  const region = segments.length > 1 ? (segments[0] as string) : 'Other';
  const city = (segments[segments.length - 1] as string).replace(/_/g, ' ');
  const offsetLabel = offsetLabelFor(zone, referenceDate);
  return {
    value: zone,
    city,
    region,
    offsetLabel,
    searchText: normalizeTimezoneQuery(`${zone} ${city} ${offsetLabel}`),
  };
}

function regionRank(region: string): [number, string] {
  return [region === 'Australia' ? 0 : 1, region];
}

function buildOptions(referenceDate: Date): TimezoneOption[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = FALLBACK_ZONES;
  }
  return zones
    .map((zone) => buildOption(zone, referenceDate))
    .sort((a, b) => {
      const [aPin, aRegion] = regionRank(a.region);
      const [bPin, bRegion] = regionRank(b.region);
      if (aPin !== bPin) return aPin - bPin;
      if (aRegion !== bRegion) return aRegion < bRegion ? -1 : 1;
      return a.city < b.city ? -1 : a.city > b.city ? 1 : 0;
    });
}

let cachedOptions: TimezoneOption[] | null = null;

/**
 * Memoized picker options. Pass `referenceDate` (tests only) to bypass the
 * cache and compute offset labels at a specific instant.
 */
export function getTimezoneOptions(referenceDate?: Date): TimezoneOption[] {
  if (referenceDate) return buildOptions(referenceDate);
  if (!cachedOptions) cachedOptions = buildOptions(new Date());
  return cachedOptions;
}
