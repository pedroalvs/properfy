// Re-export shared registry so backend consumers use a single source of truth.
export {
  MANDATORY_TEMPLATE_CODES,
  type MandatoryTemplateCode,
  PROTECTED_TEMPLATE_CLASSIFICATIONS,
  PROTECTED_TEMPLATE_CODES,
  DEFAULT_TEMPLATE_CLASSIFICATIONS,
  TEMPLATE_VARIABLES,
  type TemplateVariableSpec,
  ALLOWED_VARIABLES,
  type AllowedVariable,
  SAMPLE_DATA,
  isProtectedTemplateCode,
  getProtectedClass,
  getDefaultClass,
} from '@properfy/shared';

// Retry/backoff constants remain backend-only (not consumed by any frontend).

// Retry delays in milliseconds: 15s, 45s, 2min, 5min, 15min
export const RETRY_DELAYS = [15_000, 45_000, 120_000, 300_000, 900_000] as const;

export const MAX_RETRY_COUNT = 6;

export const JITTER_FACTOR = 0.1; // +/-10%

// Payload keys that carry secrets (raw tokens or token-bearing links). They are
// redacted at rest once the notification reaches SENT — retries re-render the
// payload, so scrubbing must never happen while a send can still occur.
export const SENSITIVE_PAYLOAD_KEYS = [
  'resetLink',
  'resetToken',
  'confirmationLink',
  'rescheduleLink',
  'inviteToken',
] as const;

export const REDACTED_PAYLOAD_VALUE = '[REDACTED]';
