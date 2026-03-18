import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// heic2any uses Worker and canvas APIs not available in jsdom
vi.mock('heic2any', () => ({
  default: vi.fn().mockRejectedValue(new Error('heic2any not available in test')),
}));
