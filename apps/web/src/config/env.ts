export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string ?? 'http://localhost:3000',
  mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN as string ?? '',
} as const;
