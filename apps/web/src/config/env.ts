export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string ?? 'http://localhost:3000',
} as const;
