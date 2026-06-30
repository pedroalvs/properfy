import { describe, it, expect } from 'vitest';
import {
  PortalTokenInvalidError,
  PortalTokenRevokedError,
  PortalActionBlockedError,
  PortalAppointmentInactiveError,
  PortalRescheduleNotAllowedError,
  PortalRescheduleWindowExceededError,
  PortalDateInPastError,
  PortalNoContactFieldsError,
} from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal.errors';
import { DomainError, NotFoundError, ForbiddenError, ConflictError } from '../../../src/shared/domain/errors';

describe('Tenant Portal Errors', () => {
  it('PortalTokenInvalidError should be a NotFoundError with status 404', () => {
    const error = new PortalTokenInvalidError();

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('PORTAL_TOKEN_INVALID');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Portal token not found or invalid');
  });

  it('PortalTokenRevokedError should be a DomainError with status 410', () => {
    const error = new PortalTokenRevokedError();

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('PORTAL_TOKEN_REVOKED');
    expect(error.statusCode).toBe(410);
    expect(error.message).toBe('Portal token has been revoked');
  });

  it('PortalActionBlockedError should be a ForbiddenError with status 403', () => {
    const error = new PortalActionBlockedError();

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('PORTAL_ACTION_BLOCKED');
    expect(error.statusCode).toBe(403);
  });

  it('PortalAppointmentInactiveError should be a ConflictError with status 409', () => {
    const error = new PortalAppointmentInactiveError();

    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('PORTAL_APPOINTMENT_INACTIVE');
    expect(error.statusCode).toBe(409);
  });

  it('PortalRescheduleNotAllowedError should be a ForbiddenError with status 403', () => {
    const error = new PortalRescheduleNotAllowedError();

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.code).toBe('PORTAL_RESCHEDULE_NOT_ALLOWED');
    expect(error.statusCode).toBe(403);
  });

  it('PortalRescheduleWindowExceededError should be a DomainError with status 422', () => {
    const error = new PortalRescheduleWindowExceededError();

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('PORTAL_RESCHEDULE_WINDOW_EXCEEDED');
    expect(error.statusCode).toBe(422);
  });

  it('PortalDateInPastError should be a DomainError with status 422', () => {
    const error = new PortalDateInPastError();

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('PORTAL_DATE_IN_PAST');
    expect(error.statusCode).toBe(422);
  });

  it('PortalNoContactFieldsError should be a DomainError with status 422', () => {
    const error = new PortalNoContactFieldsError();

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('PORTAL_NO_CONTACT_FIELDS');
    expect(error.statusCode).toBe(422);
  });
});
