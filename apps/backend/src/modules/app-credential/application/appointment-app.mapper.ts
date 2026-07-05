import type { AppointmentApp } from '@properfy/shared';
import type { AppCredentialEntity } from '../domain/app-credential.entity';

/**
 * Maps a credential to the `apps[]` shape embedded in appointment responses
 * (web detail, inspector PWA detail, create-appointment echo). Single source
 * of truth so the three embed sites cannot drift when fields are added.
 */
export function toAppointmentApp(credential: AppCredentialEntity): AppointmentApp {
  return {
    id: credential.id,
    name: credential.name,
    username: credential.username,
    password: credential.password,
    needsAuthCode: credential.needsAuthCode,
    authCode: credential.authCode ?? null,
    appUrl: credential.appUrl ?? null,
    instructionsUrl: credential.instructionsUrl ?? null,
    instructionsPassword: credential.instructionsPassword ?? null,
  };
}
