import { ianaTimezoneSchema } from '@properfy/shared';
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IUserRepository } from '../../domain/user.repository';

export interface UpdateMyTimezoneInput {
  userId: string;
  timezone: string;
}

/**
 * Self-service personal timezone (PATCH /v1/me). Cross-tenant roles only:
 * CL_* users strictly inherit the agency timezone, so the call is rejected for
 * them — CL_ADMIN changes the agency timezone via the tenant update instead.
 */
export class UpdateMyTimezoneUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdateMyTimezoneInput): Promise<void> {
    const { userId } = input;

    const user = await this.userRepo.findById(userId);
    if (!user || user.isDeleted() || user.isInactive()) {
      throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required');
    }

    if (user.role === 'CL_ADMIN' || user.role === 'CL_USER') {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'Agency users inherit the agency timezone',
      );
    }

    // Validate here as well as in the route schema so non-route callers cannot
    // store an invalid IANA identifier.
    const parsed = ianaTimezoneSchema.safeParse(input.timezone);
    if (!parsed.success) {
      throw new ValidationError('Invalid timezone', [
        { field: 'timezone', message: 'Must be a valid IANA timezone identifier' },
      ]);
    }

    await this.userRepo.updateTimezone(userId, parsed.data);

    this.auditService.log({
      action: 'user.timezone_updated',
      actorType: 'USER',
      actorId: userId,
      entityType: 'User',
      entityId: userId,
      before: { timezone: user.timezone },
      after: { timezone: parsed.data },
    });
  }
}
