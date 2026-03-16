import { prisma } from '../shared/infrastructure/prisma';
import { AuditService } from '../shared/infrastructure/audit';
import type { Logger } from '../shared/infrastructure/logger';
import { PrismaUserRepository } from '../modules/auth/infrastructure/prisma-user.repository';
import { PrismaSessionRepository } from '../modules/auth/infrastructure/prisma-session.repository';
import { JwtService } from '../modules/auth/application/services/jwt.service';
import { TotpService } from '../modules/auth/application/services/totp.service';
import { LoginUseCase } from '../modules/auth/application/use-cases/login.use-case';
import { RefreshTokenUseCase } from '../modules/auth/application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '../modules/auth/application/use-cases/logout.use-case';
import { GetMeUseCase } from '../modules/auth/application/use-cases/get-me.use-case';
import { ChangePasswordUseCase } from '../modules/auth/application/use-cases/change-password.use-case';
import { RevokeSessionUseCase } from '../modules/auth/application/use-cases/revoke-session.use-case';
import type { AuthRouteContainer } from '../modules/auth/interfaces/auth.routes';

export interface AppContainer {
  prisma: typeof prisma;
  auditService: AuditService;
  auth: AuthRouteContainer;
}

export function createContainer(logger: Logger): AppContainer {
  const auditService = new AuditService(logger);

  // Repositories
  const userRepo = new PrismaUserRepository(prisma);
  const sessionRepo = new PrismaSessionRepository(prisma);

  // Services
  const jwtPrivateKey = process.env['JWT_PRIVATE_KEY'];
  const jwtPublicKey = process.env['JWT_PUBLIC_KEY'];
  if (!jwtPrivateKey) throw new Error('Missing required environment variable: JWT_PRIVATE_KEY');
  if (!jwtPublicKey) throw new Error('Missing required environment variable: JWT_PUBLIC_KEY');

  const jwtService = new JwtService({
    privateKeyPem: jwtPrivateKey.replace(/\\n/g, '\n'),
    publicKeyPem: jwtPublicKey.replace(/\\n/g, '\n'),
    keyId: process.env['JWT_KEY_ID'] ?? 'properfy-key-v1',
    previousPublicKeyPem: process.env['JWT_PREVIOUS_PUBLIC_KEY']?.replace(/\\n/g, '\n'),
    previousKeyId: process.env['JWT_PREVIOUS_KEY_ID'],
  });
  const totpService = new TotpService();

  // Use cases
  const loginUseCase = new LoginUseCase(userRepo, sessionRepo, jwtService, totpService, auditService);
  const refreshTokenUseCase = new RefreshTokenUseCase(userRepo, sessionRepo, jwtService, auditService);
  const logoutUseCase = new LogoutUseCase(sessionRepo, auditService);
  const getMeUseCase = new GetMeUseCase(userRepo);
  const changePasswordUseCase = new ChangePasswordUseCase(userRepo, sessionRepo, auditService);
  const revokeSessionUseCase = new RevokeSessionUseCase(sessionRepo, auditService);

  return {
    prisma,
    auditService,
    auth: {
      loginUseCase,
      refreshTokenUseCase,
      logoutUseCase,
      getMeUseCase,
      changePasswordUseCase,
      revokeSessionUseCase,
      jwtService,
    },
  };
}
