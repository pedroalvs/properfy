import { randomUUID } from 'crypto';
import type { JwtService } from '../../application/services/jwt.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';

export interface KeyExpiryCheckResult {
  daysRemaining: number | null;
  level: 'ok' | 'warning' | 'critical';
}

export class KeyExpiryCheckWorker {
  constructor(
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  execute(): KeyExpiryCheckResult {
    const requestId = randomUUID();
    // #558: bind requestId onto a child logger so every log line from this run
    // carries it in its structured context, without changing the message/args
    // shape callers already assert on.
    const logger = this.logger.child({ requestId });
    const daysRemaining = this.jwtService.getPreviousKeyDaysRemaining();

    if (daysRemaining === null) {
      logger.info('No previous JWT key configured, nothing to check');
      return { daysRemaining: null, level: 'ok' };
    }

    let level: KeyExpiryCheckResult['level'] = 'ok';

    if (daysRemaining <= 1) {
      level = 'critical';
      logger.error(
        { daysRemaining },
        'CRITICAL: JWT previous key expires in %d day(s) or has already expired. Remove JWT_PREVIOUS_* variables and redeploy.',
        daysRemaining,
      );
    } else if (daysRemaining <= 7) {
      level = 'warning';
      logger.warn(
        { daysRemaining },
        'WARNING: JWT previous key expires in %d day(s). Plan to clean up JWT_PREVIOUS_* variables soon.',
        daysRemaining,
      );
    } else {
      logger.info(
        { daysRemaining },
        'JWT previous key grace period: %d day(s) remaining',
        daysRemaining,
      );
    }

    this.auditService.log({
      action: 'auth.key_expiry_check',
      actorType: 'SYSTEM',
      entityType: 'jwt_key',
      requestId,
      metadata: { daysRemaining, level },
    });

    return { daysRemaining, level };
  }
}
