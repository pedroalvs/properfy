// Global test setup
// Integration tests that need a database should set DATABASE_URL
// before running (e.g., via .env.test or environment)

import { afterAll, beforeAll } from 'vitest';

// Prevent pg-boss from starting in unit tests
process.env['NODE_ENV'] = 'test';

beforeAll(() => {
  // Setup global test state if needed
});

afterAll(() => {
  // Cleanup global test state if needed
});
