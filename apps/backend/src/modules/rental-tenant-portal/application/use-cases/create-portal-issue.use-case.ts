import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type {
  PortalCreatePropertyIssueInput,
  PortalPropertyIssueResponse,
} from '@properfy/shared';
import { PORTAL_MAX_PHOTOS_PER_ISSUE } from '@properfy/shared';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Clock } from '../../../../shared/domain/clock';
import { SystemClock } from '../../../../shared/domain/clock';
import type { IPropertyIssueRepository } from '../../../property-file/domain/property-issue.repository';
import type { IPropertyFileRepository } from '../../../property-file/domain/property-file.repository';
import {
  PropertyNotFoundError,
  PropertyIssueTooManyPhotosError,
  PropertyIssuePhotoLinkError,
  PropertyFileIdempotencyKeyMissingError,
  PropertyFileIdempotencyMismatchError,
} from '../../../property-file/domain/property-file.errors';
import { PortalIssueNoPropertyError } from '../../domain/rental-tenant-portal.errors';
import { toPortalPropertyIssueResponse } from '../portal-issue-mappers';

const SCOPE = 'portal.property-issue.create';
const TTL_HOURS = 24;

export interface CreatePortalIssueCommand {
  /** The appointment pinned by the portal token (never client input). */
  appointmentId: string;
  input: PortalCreatePropertyIssueInput;
  idempotencyKey: string | undefined;
  requestId?: string;
}

/**
 * Create a rental-tenant-reported issue from the portal (F10-4). The issue is
 * always `source = RENTAL_TENANT_PORTAL`, `createdByUserId = null`, scoped to the
 * token's appointment/property/tenant. Referenced photos are linked atomically
 * (D20); a partial link rolls the whole creation back.
 */
export class CreatePortalIssueUseCase {
  constructor(
    private readonly prisma: PrismaClient | undefined,
    private readonly issueRepo: IPropertyIssueRepository,
    private readonly fileRepo: IPropertyFileRepository,
    private readonly platformSettings: IPlatformSettingsReader,
    private readonly idempotency: IIdempotencyService,
    private readonly audit: AuditService,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(command: CreatePortalIssueCommand): Promise<PortalPropertyIssueResponse> {
    const { appointmentId, input, idempotencyKey, requestId } = command;
    if (!idempotencyKey) throw new PropertyFileIdempotencyKeyMissingError();

    const scope = await this.issueRepo.findAppointmentScope(appointmentId);
    if (!scope) throw new PropertyNotFoundError();
    if (!scope.propertyId) throw new PortalIssueNoPropertyError();
    const { propertyId, tenantId } = scope;

    const config = await this.platformSettings.get('propertyFiles');
    const effectiveMax = Math.min(PORTAL_MAX_PHOTOS_PER_ISSUE, config.maxPhotosPerIssue);
    const photoFileIds = input.photoFileIds ?? [];
    if (photoFileIds.length > effectiveMax) {
      throw new PropertyIssueTooManyPhotosError(effectiveMax);
    }

    // Bind the idempotency cache to the token's appointment (the key is client-chosen).
    const payloadHash = hashIdempotencyPayload({ ...input, _appointmentId: appointmentId });
    const cached = await this.idempotency.getWithHash<PortalPropertyIssueResponse>(
      idempotencyKey,
      SCOPE,
    );
    if (cached) {
      if (cached.payloadHash !== payloadHash) throw new PropertyFileIdempotencyMismatchError();
      return cached.response;
    }

    return runInTransaction(this.prisma, async ({ tx, defer }) => {
      const reread = await this.idempotency.getWithHash<PortalPropertyIssueResponse>(
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
          tenantId,
          propertyId,
          appointmentId,
          reason: input.reason,
          source: 'RENTAL_TENANT_PORTAL',
          createdByUserId: null,
          cantDoEventId: null,
          createdAt: now,
        },
        tx,
      );

      // D20: attach every referenced PENDING issue photo atomically; a partial
      // link means a photo was missing/foreign/unconfirmed/already-linked → 409.
      // The portal-scoped link also pins `appointment_id` + `uploaded_by_user_id
      // IS NULL`, so a token can never link another appointment's photo nor a
      // staff member's in-flight issue photo on the same property+tenant.
      if (photoFileIds.length > 0) {
        const linked = await this.fileRepo.linkPendingPortalIssuePhotos(
          {
            fileIds: photoFileIds,
            issueId,
            propertyId,
            appointmentId,
            tenantId,
            now,
          },
          tx,
        );
        if (linked !== photoFileIds.length) throw new PropertyIssuePhotoLinkError();
      }

      const photos = await this.fileRepo.listReadyPhotosByIssueIds([issueId], tx);
      const output = toPortalPropertyIssueResponse(issue, photos);
      await this.idempotency.set(idempotencyKey, SCOPE, output, TTL_HOURS, payloadHash, tx);

      defer(async () => {
        this.audit.log({
          action: 'property_issue.created',
          actorType: 'ANONYMOUS',
          entityType: 'PropertyIssue',
          entityId: issueId,
          tenantId,
          after: {
            source: 'RENTAL_TENANT_PORTAL',
            appointmentId,
            photoCount: photos.length,
          },
          requestId,
        });
      });

      return output;
    });
  }
}
