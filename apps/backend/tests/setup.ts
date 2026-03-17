// Global test setup
// Integration tests that need a database should set DATABASE_URL
// before running (e.g., via .env.test or environment)

import { afterAll, beforeAll } from 'vitest';

// Prevent pg-boss from starting in unit tests
process.env['NODE_ENV'] = 'test';

// Provide required env vars for tests (only if not already set)
process.env['DATABASE_URL'] ??= 'postgresql://test:test@localhost:5432/properfy_test';
process.env['JWT_PRIVATE_KEY'] ??= 'test-private-key';
process.env['JWT_PUBLIC_KEY'] ??= 'test-public-key';

beforeAll(() => {
  // Setup global test state if needed
});

afterAll(() => {
  // Cleanup global test state if needed
});
