import type { AuthContext, ServiceTypeFlowType } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IServiceRegionRepository, ResolvedRegion } from '../../../service-region/domain/service-region.repository';
import type { CreateServiceGroupUseCase } from '../use-cases/create-service-group.use-case';
import type { PublishServiceGroupUseCase } from '../use-cases/publish-service-group.use-case';

/**
 * Why an auto-group could not be published. Recorded on the
 * `appointment.auto_group_incomplete` audit entry so an operator can query for
 * automation that stopped half-way.
 */
export type AutoGroupIncompleteReason =
  /** Property has no coordinates, or no ACTIVE region contains it. */
  | 'NO_REGION_MATCH'
  /** Region was deactivated between resolution and create/publish. */
  | 'REGION_INACTIVE'
  /** Imported row whose slot had already started. */
  | 'TIME_IN_PAST'
  /** Defensive: create never bypasses DATE_IN_PAST. */
  | 'DATE_IN_PAST'
  /** The group could not be created at all. */
  | 'GROUP_CREATE_FAILED'
  /** The group exists but publish was refused (raced, or a guard rejected it). */
  | 'PUBLISH_FAILED';

export type AutoGroupOutcome =
  /** ROUTINE service type — nothing to do. */
  | { kind: 'SKIPPED' }
  /** Group created and published; the appointment is live on the marketplace. */
  | { kind: 'PUBLISHED'; groupId: string }
  /** Group created but left DRAFT for an operator to finish. */
  | { kind: 'DRAFT'; groupId: string; reason: AutoGroupIncompleteReason }
  /** No group exists. The appointment is untouched and still DRAFT. */
  | { kind: 'FAILED'; reason: AutoGroupIncompleteReason };

export interface AutoGroupInput {
  appointmentId: string;
  tenantId: string;
  serviceTypeId: string;
  flowType: ServiceTypeFlowType;
  /** YYYY-MM-DD */
  scheduledDate: string;
  /** HH:mm */
  timeSlotStart: string;
  /** HH:mm */
  timeSlotEnd: string;
  actor: AuthContext;
}

/**
 * The only flow types that auto-group. Deliberately an allowlist: publishing
 * puts work in front of inspectors, so an unrecognised flow type must fall
 * through to the manual path rather than be treated as "not ROUTINE, therefore
 * auto-publish".
 */
const AUTO_GROUPED_FLOW_TYPES: ReadonlySet<string> = new Set(['INGOING', 'OUTGOING']);

/** Errors that mean "the region we picked is no longer usable". */
const REGION_UNUSABLE_CODES = new Set(['SERVICE_REGION_INACTIVE', 'SERVICE_REGION_NOT_FOUND']);

/**
 * Short domain code of an error, or `undefined` when it carries none.
 *
 * Exported because `CreateAppointmentUseCase` writes the same
 * `appointment.auto_group_incomplete` audit action: two writers using different
 * extraction would put incompatible value shapes under one `metadata.errorCode`.
 * It also keeps `err.message` out of the retained audit log — a driver error is
 * not a controlled string and can embed the row it choked on.
 */
export function errorCodeOf(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

/**
 * Picks the region an auto-created group is filed under.
 *
 * A group built for a single appointment matches every region whose polygon
 * contains that one property, and `resolveRegionsForAppointments` ranks by
 * `COUNT(DISTINCT appointment_id)` — which is 1 for all of them. So with
 * overlapping regions that ranking is a full tie, and `region_number` is what
 * settles it: lowest wins, i.e. the region created first is the canonical one.
 * Chosen over the region name because a rename cannot disturb it.
 *
 * Sorted here as well as in SQL so the rule survives a caller that reorders the
 * list, and so it is unit-testable without a database.
 *
 * Returns `undefined` when nothing matched, which sends the group to DRAFT.
 */
export function pickRegion(regions: ResolvedRegion[]): ResolvedRegion | undefined {
  if (regions.length === 0) return undefined;
  return [...regions].sort((a, b) => a.regionNumber - b.regionNumber)[0];
}

/**
 * Creates and publishes a one-appointment service group for INGOING/OUTGOING
 * services, so they reach the marketplace without an operator grouping them by
 * hand. ROUTINE services are untouched.
 *
 * **This never throws.** Appointment creation must not fail because the
 * automation could not finish, so every failure degrades to an outcome the
 * caller can record: a DRAFT group the operator can publish, or no group at
 * all. `trySyncAppointmentScheduleToGroup` sets the same precedent.
 *
 * Called from `CreateAppointmentUseCase`, which covers the API and the import
 * commit worker at once (the worker calls that use case directly).
 */
export class AutoGroupIngoingOutgoingService {
  constructor(
    private readonly createServiceGroupUseCase: CreateServiceGroupUseCase,
    private readonly publishServiceGroupUseCase: PublishServiceGroupUseCase,
    private readonly serviceRegionRepo: IServiceRegionRepository,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async tryAutoGroupAndPublish(input: AutoGroupInput): Promise<AutoGroupOutcome> {
    if (!AUTO_GROUPED_FLOW_TYPES.has(input.flowType)) return { kind: 'SKIPPED' };

    // Derived from the real actor rather than a synthetic SYSTEM principal:
    // service_groups.created_by_user_id is an FK to users and there is no
    // SYSTEM row, and the creator's action is genuinely what caused the group.
    const systemActor: AuthContext = { ...input.actor, role: 'SYS' };

    let groupId: string | undefined;
    try {
      const regions = await this.serviceRegionRepo.resolveRegionsForAppointments([input.appointmentId]);
      const picked = pickRegion(regions);

      const group = await this.createGroup(input, systemActor, picked?.regionId ?? null);
      groupId = group.groupId;

      if (!group.regionAttached) {
        return this.incomplete(input, groupId, group.reason ?? 'NO_REGION_MATCH');
      }

      await this.publishServiceGroupUseCase.execute({ groupId, actor: systemActor });

      this.logger.info(
        { appointmentId: input.appointmentId, groupId, flowType: input.flowType, regionId: picked?.regionId },
        'appointment.auto_group_outcome',
      );
      return { kind: 'PUBLISHED', groupId };
    } catch (err) {
      const code = errorCodeOf(err);
      // The group exists but could not be released: leave it DRAFT rather than
      // reporting total failure, so the operator has something to repair.
      if (groupId) {
        const reason: AutoGroupIncompleteReason =
          code === 'SERVICE_GROUP_TIME_IN_PAST'
            ? 'TIME_IN_PAST'
            : code === 'SERVICE_GROUP_DATE_IN_PAST'
              ? 'DATE_IN_PAST'
              : code && REGION_UNUSABLE_CODES.has(code)
                ? 'REGION_INACTIVE'
                : 'PUBLISH_FAILED';
        return this.incomplete(input, groupId, reason, err);
      }

      this.auditIncomplete(input, undefined, 'GROUP_CREATE_FAILED', code);
      this.logger.error(
        { err, appointmentId: input.appointmentId, flowType: input.flowType, errorCode: code },
        'appointment.auto_group_outcome',
      );
      return { kind: 'FAILED', reason: 'GROUP_CREATE_FAILED' };
    }
  }

  /**
   * Creates the group, retrying once without a region when the region we
   * resolved has been deactivated in the meantime. Losing the region costs a
   * DRAFT group; losing the whole group would strand the appointment.
   */
  private async createGroup(
    input: AutoGroupInput,
    systemActor: AuthContext,
    serviceRegionId: string | null,
  ): Promise<{ groupId: string; regionAttached: boolean; reason?: AutoGroupIncompleteReason }> {
    const payload = {
      appointmentIds: [input.appointmentId],
      serviceTypeId: input.serviceTypeId,
      scheduledDate: input.scheduledDate,
      // One appointment, so its own slot is the group's window. This round-trips
      // as a no-op through the create-time schedule sync (the clamp compares
      // with >= / <=), so it writes no spurious appointment.updated audit row.
      timeWindow: `${input.timeSlotStart}-${input.timeSlotEnd}`,
      skipTimeInPastCheck: true,
      actor: systemActor,
    };

    try {
      const group = await this.createServiceGroupUseCase.execute({ ...payload, serviceRegionId });
      return { groupId: group.id, regionAttached: serviceRegionId !== null };
    } catch (err) {
      const code = errorCodeOf(err);
      if (serviceRegionId === null || !code || !REGION_UNUSABLE_CODES.has(code)) throw err;

      const group = await this.createServiceGroupUseCase.execute({ ...payload, serviceRegionId: null });
      return { groupId: group.id, regionAttached: false, reason: 'REGION_INACTIVE' };
    }
  }

  private incomplete(
    input: AutoGroupInput,
    groupId: string,
    reason: AutoGroupIncompleteReason,
    err?: unknown,
  ): AutoGroupOutcome {
    this.auditIncomplete(input, groupId, reason, errorCodeOf(err));
    this.logger.warn(
      { appointmentId: input.appointmentId, groupId, flowType: input.flowType, reason },
      'appointment.auto_group_outcome',
    );
    return { kind: 'DRAFT', groupId, reason };
  }

  /**
   * Emitted only on the non-happy paths. A published group is already fully
   * traceable through service_group.created -> appointment.status_transition ->
   * service_group.published, so a success entry here would be pure noise.
   */
  private auditIncomplete(
    input: AutoGroupInput,
    groupId: string | undefined,
    reason: AutoGroupIncompleteReason,
    errorCode?: string,
  ): void {
    this.auditService.log({
      action: 'appointment.auto_group_incomplete',
      actorType: 'SYSTEM',
      actorId: input.actor.userId,
      entityType: 'Appointment',
      entityId: input.appointmentId,
      tenantId: input.tenantId,
      metadata: { groupId, flowType: input.flowType, reason, errorCode },
    });
  }
}
