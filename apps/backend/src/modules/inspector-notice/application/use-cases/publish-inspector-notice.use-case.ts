import type { PrismaClient } from '@prisma/client';
import {
  type InspectorNoticeAudience,
  type InspectorNoticeSummary,
  type PublishInspectorNoticeInput,
  getInspectorNoticeDeliverExpireMinutes,
} from '@properfy/shared';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Clock } from '../../../../shared/domain/clock';
import { hashIdempotencyPayload } from '../../../../shared/domain/idempotency-payload-hash';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IInspectorDirectoryRepository } from '../../domain/inspector-directory.repository';
import { InspectorNoticeIdempotencyKeyMissingError, InspectorNoticeIdempotencyPayloadMismatchError, InspectorNoticeNoRecipientsError } from '../../domain/inspector-notice.errors';
import type { IInspectorNoticeRepository } from '../../domain/inspector-notice.repository';
import type { ResolveNoticeRecipientsService } from '../services/resolve-notice-recipients';

const SCOPE = 'inspector-notice.publish';
const TTL_HOURS = 24;
const DELIVER_JOB = 'inspector-notice.deliver';

export interface PublishInspectorNoticeCommand {
  body: PublishInspectorNoticeInput;
  idempotencyKey: string | undefined;
  actorUserId: string;
  requestId?: string;
}

export class PublishInspectorNoticeUseCase {
  constructor(
    private readonly prisma: PrismaClient | undefined,
    private readonly repo: IInspectorNoticeRepository,
    private readonly directory: IInspectorDirectoryRepository,
    private readonly resolveRecipients: ResolveNoticeRecipientsService,
    private readonly idempotency: IIdempotencyService,
    private readonly jobQueue: IJobQueue,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly logger?: Logger,
  ) {}

  async execute(command: PublishInspectorNoticeCommand): Promise<InspectorNoticeSummary> {
    const { body, idempotencyKey, actorUserId, requestId } = command;
    if (!idempotencyKey) {
      throw new InspectorNoticeIdempotencyKeyMissingError();
    }

    const payloadHash = hashIdempotencyPayload(body);

    // Fast path: a completed record outside the transaction.
    const cached = await this.idempotency.getWithHash<InspectorNoticeSummary>(idempotencyKey, SCOPE);
    if (cached) {
      if (cached.payloadHash !== payloadHash) {
        throw new InspectorNoticeIdempotencyPayloadMismatchError();
      }
      return cached.response;
    }

    return runInTransaction(this.prisma, async ({ tx, defer }) => {
      // Serialize concurrent publishes with the same key, then re-read under the lock.
      await this.repo.acquirePublishLock(`${SCOPE}:${idempotencyKey}`, tx);
      const reread = await this.idempotency.getWithHash<InspectorNoticeSummary>(idempotencyKey, SCOPE, tx);
      if (reread) {
        if (reread.payloadHash !== payloadHash) {
          throw new InspectorNoticeIdempotencyPayloadMismatchError();
        }
        return reread.response;
      }

      const resolved = await this.resolveRecipients.resolve(body.audience);
      if (resolved.inspectorIds.length === 0) {
        throw new InspectorNoticeNoRecipientsError();
      }

      const audienceJson = buildAudienceJson(body.audience, resolved);
      const now = this.clock.now();
      const entity = await this.repo.create(
        {
          title: body.title,
          body: body.body,
          critical: body.critical,
          audience: audienceJson,
          systemType: null,
          dedupeKey: null,
          targetPath: null,
          authorUserId: actorUserId,
          recipientInspectorIds: resolved.inspectorIds,
          now,
        },
        tx,
      );

      const authorName = await this.directory.findUserName(actorUserId);
      const output: InspectorNoticeSummary = {
        id: entity.id,
        title: entity.title,
        body: entity.body,
        critical: entity.critical,
        audience: audienceJson,
        author: { type: 'USER', name: authorName },
        publishedAt: entity.publishedAt.toISOString(),
        archivedAt: null,
        recipientCount: resolved.inspectorIds.length,
        readCount: 0,
      };

      await this.idempotency.set(idempotencyKey, SCOPE, output, TTL_HOURS, payloadHash, tx);

      defer(async () => {
        this.audit.log({
          action: 'inspector_notice.published',
          actorType: 'USER',
          actorId: actorUserId,
          entityType: 'InspectorNotice',
          entityId: entity.id,
          tenantId: null,
          after: {
            title: entity.title,
            critical: entity.critical,
            audience: audienceJson,
            recipientCount: resolved.inspectorIds.length,
            systemType: null,
          },
          requestId,
        });
      });

      defer(async () => {
        try {
          await this.jobQueue.enqueue(
            DELIVER_JOB,
            { noticeId: entity.id, _requestId: requestId },
            {
              singletonKey: entity.id,
              retryLimit: 3,
              retryBackoff: true,
              expireInMinutes: getInspectorNoticeDeliverExpireMinutes(resolved.inspectorIds.length),
            },
          );
        } catch (error) {
          this.logger?.error(
            { err: error, noticeId: entity.id },
            'inspector_notice.enqueue_failed',
          );
        }
      });

      return output;
    });
  }
}

function buildAudienceJson(
  audience: PublishInspectorNoticeInput['audience'],
  resolved: { inspectorIds: string[]; regionName?: string },
): InspectorNoticeAudience {
  switch (audience.type) {
    case 'ALL':
      return { type: 'ALL' };
    case 'SELECTED':
      return { type: 'SELECTED', inspectorIds: resolved.inspectorIds };
    case 'REGION':
      return { type: 'REGION', regionId: audience.regionId, regionName: resolved.regionName ?? '' };
  }
}
