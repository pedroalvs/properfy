import type { PrismaClient } from '@prisma/client';
import {
  INSPECTOR_NOTICE_BODY_MAX,
  INSPECTOR_NOTICE_TITLE_MAX,
  type SystemInspectorNoticeType,
  SYSTEM_NOTICE_CRITICALITY,
  getInspectorNoticeDeliverExpireMinutes,
  isAllowedInspectorNoticeTargetPath,
} from '@properfy/shared';
import { runInTransaction } from '../../../../shared/application/unit-of-work';
import type { Clock } from '../../../../shared/domain/clock';
import { ValidationError } from '../../../../shared/domain/errors';
import type { IJobQueue } from '../../../../shared/domain/job-queue';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IInspectorDirectoryRepository } from '../../domain/inspector-directory.repository';
import type { IInspectorNoticeRepository } from '../../domain/inspector-notice.repository';

const DELIVER_JOB = 'inspector-notice.deliver';

/**
 * Internal contract for F03/F04/F08 to raise a system notice. No HTTP route. `critical`
 * is derived from the type (never chosen by the caller). Idempotent by `dedupeKey`.
 *
 * Content rule (L-F02-07): title and body appear on the inspector's lock screen and
 * watch — callers MUST NOT include key/lockbox codes, passwords, or tenant name/phone.
 * A property address and the service code are acceptable.
 */
export interface PublishSystemInspectorNoticeInput {
  type: SystemInspectorNoticeType;
  inspectorIds: string[];
  title: string;
  body: string;
  dedupeKey: string;
  targetPath?: string;
  requestId?: string;
}

export interface PublishSystemInspectorNoticeOutput {
  noticeId: string | null;
  created: boolean;
}

export class PublishSystemInspectorNoticeUseCase {
  constructor(
    private readonly prisma: PrismaClient | undefined,
    private readonly repo: IInspectorNoticeRepository,
    private readonly directory: IInspectorDirectoryRepository,
    private readonly jobQueue: IJobQueue,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly logger?: Logger,
  ) {}

  async execute(
    input: PublishSystemInspectorNoticeInput,
  ): Promise<PublishSystemInspectorNoticeOutput> {
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length < 1 || title.length > INSPECTOR_NOTICE_TITLE_MAX) {
      throw new ValidationError('title must be 1-120 characters');
    }
    if (body.length < 1 || body.length > INSPECTOR_NOTICE_BODY_MAX) {
      throw new ValidationError('body must be 1-2000 characters');
    }
    if (input.targetPath !== undefined && !isAllowedInspectorNoticeTargetPath(input.targetPath)) {
      throw new ValidationError('targetPath is not allowed');
    }

    const existing = await this.repo.findByDedupeKey(input.dedupeKey);
    if (existing) {
      return { noticeId: existing.id, created: false };
    }

    const inspectorIds = await this.directory.findActiveInspectorIdsByIds(input.inspectorIds);
    if (inspectorIds.length === 0) {
      this.logger?.info(
        { dedupeKey: input.dedupeKey, type: input.type },
        'inspector_notice.system_no_recipients',
      );
      return { noticeId: null, created: false };
    }

    const critical = SYSTEM_NOTICE_CRITICALITY[input.type];
    const targetPath = input.targetPath ?? null;

    try {
      return await runInTransaction(this.prisma, async ({ tx, defer }) => {
        const now = this.clock.now();
        const entity = await this.repo.create(
          {
            title,
            body,
            critical,
            audience: { type: 'SYSTEM', systemType: input.type },
            systemType: input.type,
            dedupeKey: input.dedupeKey,
            targetPath,
            authorUserId: null,
            recipientInspectorIds: inspectorIds,
            now,
          },
          tx,
        );

        defer(async () => {
          this.audit.log({
            action: 'inspector_notice.published',
            actorType: 'SYSTEM',
            entityType: 'InspectorNotice',
            entityId: entity.id,
            tenantId: null,
            after: {
              title,
              critical,
              audience: { type: 'SYSTEM', systemType: input.type },
              recipientCount: inspectorIds.length,
              systemType: input.type,
            },
            requestId: input.requestId,
          });
        });

        defer(async () => {
          try {
            await this.jobQueue.enqueue(
              DELIVER_JOB,
              { noticeId: entity.id, _requestId: input.requestId },
              {
                singletonKey: entity.id,
                retryLimit: 3,
                retryBackoff: true,
                expireInMinutes: getInspectorNoticeDeliverExpireMinutes(inspectorIds.length),
              },
            );
          } catch (error) {
            this.logger?.error({ err: error, noticeId: entity.id }, 'inspector_notice.enqueue_failed');
          }
        });

        return { noticeId: entity.id, created: true };
      });
    } catch (error) {
      // Concurrent insert with the same dedupe_key: treat as already published.
      if (isUniqueConstraintViolation(error)) {
        const raced = await this.repo.findByDedupeKey(input.dedupeKey);
        if (raced) {
          return { noticeId: raced.id, created: false };
        }
      }
      throw error;
    }
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  // Prisma unique-constraint violations carry code 'P2002'; a raw $executeRaw path surfaces
  // the Postgres 23505 instead. Both expose it on `.code`.
  const code = (error as { code?: unknown }).code;
  return code === 'P2002' || code === '23505';
}
