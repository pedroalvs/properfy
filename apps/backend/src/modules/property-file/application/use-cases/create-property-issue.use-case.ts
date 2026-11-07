import { randomUUID } from 'node:crypto';
import type {
  AuthContext,
  CreatePropertyIssueInput,
  PropertyIssueResponse,
  PropertyIssueSource,
} from '@properfy/shared';
import type { PrismaClient } from '@prisma/client';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import { assertTenantScope } from '../../../../shared/domain/require-tenant-scope';
import type { IPropertyIssueRepository } from '../../domain/property-issue.repository';
import type { IPropertyFileRepository } from '../../domain/property-file.repository';
import type { IInspectorAppointmentVisibility } from '../../domain/inspector-appointment-visibility';
import { toPropertyIssueResponse } from '../mappers';
import {
  PropertyNotFoundError,
  PropertyIssueNotFoundError,
  PropertyFileForbiddenError,
  PropertyIssueAppointmentMismatchError,
  PropertyIssueTooManyPhotosError,
  PropertyIssuePhotoLinkError,
  PropertyFileIdempotencyKeyMissingError,
  PropertyFileIdempotencyMismatchError,
} from '../../domain/property-file.errors';

const SCOPE = 'property-issue.create';
const TTL_HOURS = 24;

export interface CreatePropertyIssueCommand {
  actor: AuthContext;
  input: CreatePropertyIssueInput;
  idempotencyKey: string | undefined;
  requestId?: string;
}

interface ResolvedIssueScope {
  source: PropertyIssueSource;
  tenantId: string;
  appointmentId: string | null;
  cantDoEventId: string | null;
}

export class CreatePropertyIssueUseCase {
  constructor(
    private readonly prisma: PrismaClient | undefined,
    private readonly issueRepo: IPropertyIssueRepository,
    private readonly fileRepo: IPropertyFileRepository,
    private readonly visibility: IInspectorAppointmentVisibility,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly idempotency: IIdempotencyService,
    private readonly audit: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(command: CreatePropertyIssueCommand): Promise<PropertyIssueResponse> {
    const { actor, input, idempotencyKey, requestId } = command;
    if (!idempotencyKey) throw new PropertyFileIdempotencyKeyMissingError();

    // CL_USER excluded (matrix); INSP, CL_ADMIN, OP, AM may create.
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN', 'INSP'], {
      action: 'property_issue.create',
      entityType: 'PropertyIssue',
    });

    const propertyTenantId = await this.fileRepo.findPropertyTenantId(input.propertyId);
    if (!propertyTenantId) throw new PropertyNotFoundError();

    const resolved = await this.resolveScope(actor, input, propertyTenantId);

    // Non-INSP: validate any supplied appointment belongs to the property + tenant (D1).
    if (resolved.appointmentId && actor.role !== 'INSP') {
      const scope = await this.issueRepo.findAppointmentScope(resolved.appointmentId);
      if (!scope || scope.propertyId !== input.propertyId || scope.tenantId !== resolved.tenantId) {
        throw new PropertyIssueAppointmentMismatchError();
      }
    }

    const config = await this.platformSettings.get('propertyFiles');
    const photoFileIds = input.photoFileIds ?? [];
    if (photoFileIds.length > config.maxPhotosPerIssue) {
      throw new PropertyIssueTooManyPhotosError(config.maxPhotosPerIssue);
    }

    const payloadHash = hashIdempotencyPayload(input);
    const cached = await this.idempotency.getWithHash<PropertyIssueResponse>(idempotencyKey, SCOPE);
    if (cached) {
      if (cached.payloadHash !== payloadHash) throw new PropertyFileIdempotencyMismatchError();
      return cached.response;
    }

    return runInTransaction(this.prisma, async ({ tx, defer }) => {
      const reread = await this.idempotency.getWithHash<PropertyIssueResponse>(
        idempotencyKey,
        SCOPE,
        tx,
      );
      if (reread) {
        if (reread.payloadHash !== payloadHash) throw new PropertyFileIdempotencyMismatchError();
        return reread.response;
      }

      const now = this.clock.now();
      const issueId = randomUUID();
      const issue = await this.issueRepo.create(
        {
          id: issueId,
          tenantId: resolved.tenantId,
          propertyId: input.propertyId,
          appointmentId: resolved.appointmentId,
          reason: input.reason,
          source: resolved.source,
          createdByUserId: actor.userId,
          cantDoEventId: resolved.cantDoEventId,
          createdAt: now,
        },
        tx,
      );

      // D20: attach every referenced PENDING issue photo atomically; a partial
      // link means a photo was missing/foreign/already-linked → 409 + rollback.
      if (photoFileIds.length > 0) {
        const linked = await this.fileRepo.linkPendingIssuePhotos(
          {
            fileIds: photoFileIds,
            issueId,
            appointmentId: resolved.appointmentId,
            tenantId: resolved.tenantId,
            now,
          },
          tx,
        );
        if (linked !== photoFileIds.length) throw new PropertyIssuePhotoLinkError();
      }

      const photos = await this.fileRepo.listReadyPhotosByIssueIds([issueId], tx);
      const output = toPropertyIssueResponse(issue, photos);
      await this.idempotency.set(idempotencyKey, SCOPE, output, TTL_HOURS, payloadHash, tx);

      defer(async () => {
        this.audit.log({
          action: 'property_issue.created',
          actorType: 'USER',
          actorId: actor.userId,
          entityType: 'PropertyIssue',
          entityId: issueId,
          tenantId: resolved.tenantId,
          after: {
            source: resolved.source,
            appointmentId: resolved.appointmentId,
            photoCount: photos.length,
            cantDoEventId: resolved.cantDoEventId,
          },
          requestId,
        });
      });

      return output;
    });
  }

  private async resolveScope(
    actor: AuthContext,
    input: CreatePropertyIssueInput,
    propertyTenantId: string,
  ): Promise<ResolvedIssueScope> {
    const appointmentId = input.appointmentId ?? null;
    switch (actor.role) {
      case 'AM':
      case 'OP':
        return { source: 'STAFF', tenantId: propertyTenantId, appointmentId, cantDoEventId: null };
      case 'CL_ADMIN': {
        const tenantId = assertTenantScope(actor, 'property_issue.create');
        if (propertyTenantId !== tenantId) throw new PropertyNotFoundError();
        return { source: 'STAFF', tenantId, appointmentId, cantDoEventId: null };
      }
      case 'INSP': {
        if (!actor.inspectorId || !appointmentId) {
          throw new PropertyFileForbiddenError('An appointment is required to report an issue.');
        }
        const vis = await this.visibility.resolveForInspector(appointmentId, actor.inspectorId);
        if (!vis || vis.propertyId !== input.propertyId) throw new PropertyIssueNotFoundError();
        return {
          source: 'INSPECTOR',
          tenantId: vis.tenantId,
          appointmentId,
          cantDoEventId: input.cantDoEventId ?? null,
        };
      }
      default:
        throw new PropertyFileForbiddenError();
    }
  }
}
