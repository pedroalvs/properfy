import { vi } from 'vitest';
import type { AuthContext, UserRole, PropertyFilesSetting } from '@properfy/shared';
import { DEFAULT_PROPERTY_FILES_SETTING } from '@properfy/shared';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { IPlatformSettingsReader } from '../../../src/shared/domain/platform-settings';

export const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
export const PROPERTY_A = '11111111-1111-1111-1111-111111111111';
export const APPT_A = '22222222-2222-2222-2222-222222222222';
export const INSPECTOR_A = '33333333-3333-3333-3333-333333333333';
export const USER_A = '44444444-4444-4444-4444-444444444444';

export function makeActor(role: UserRole, overrides: Partial<AuthContext> = {}): AuthContext {
  const base: AuthContext = {
    userId: USER_A,
    tenantId: role === 'CL_ADMIN' || role === 'CL_USER' ? TENANT_A : null,
    role,
    branchId: null,
    inspectorId: role === 'INSP' ? INSPECTOR_A : null,
  };
  return { ...base, ...overrides };
}

/** A real AuthorizationService backed by a no-op audit (assertRoles is pure). */
export function makeAuthorizationService(): AuthorizationService {
  return new AuthorizationService({ log: vi.fn() });
}

export const fakeAudit = () => ({ log: vi.fn() });

export function makePlatformSettings(
  overrides: Partial<PropertyFilesSetting> = {},
): IPlatformSettingsReader {
  const config: PropertyFilesSetting = { ...DEFAULT_PROPERTY_FILES_SETTING, ...overrides };
  return {
    get: vi.fn(async (key: string) => {
      if (key === 'propertyFiles') return config as never;
      throw new Error(`unexpected platform setting ${key}`);
    }),
  } as unknown as IPlatformSettingsReader;
}
