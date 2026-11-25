import type { PrismaClient, Prisma } from '@prisma/client';
import type { CycleConfirmationSource } from '@properfy/shared';
import { ConfirmationCycleEntity } from '../../domain/confirmation-cycle.entity';
import type { IConfirmationCycleRepository } from '../../domain/confirmation-cycle.repository';
import {
  ConfirmationCycleNotFoundError,
  ConfirmationCycleAlreadyTerminalError,
  ConfirmationCycleStateError,
} from '../../domain/confirmation-cycle.errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { TxContext } from '../../../../shared/application/unit-of-work';
import { retryOnUniqueConflict, isUniqueConflictOn } from '../../../../shared/domain/retry-on-unique-conflict';

type Tx = Prisma.TransactionClient;
type Defer = TxContext['defer'];

/**
 * O-11: why a portal-link operation changed the appointment's confirmation
 * status, recorded on the appointment-level audit so the operator (and the web
 * timeline) can see what reset a confirmation. Backend-internal — stored in the
 * audit entry's `metadata.cause`, not a shared/api contract value.
 */
export type ConfirmationResetCause = 'PORTAL_LINK_GENERATED' | 'GROUP_PORTAL_LINK_RESEND';

/** Who triggered a link operation + why, for the O-11 appointment-level audit. */
export interface ConfirmationResetAuditContext {
  actorId: string;
  cause: ConfirmationResetCause;
}

/** Audit action for the O-11 appointment-level confirmation-reset record. */
export const CONFIRMATION_RESET_AUDIT_ACTION = 'appointment.rental_tenant_confirmation_reset';

/**
 * Every uniqueness invariant two concurrent cycle creators can collide on, so
 * `retryOnUniqueConflict` replays the whole transaction (the loser re-reads and
 * adopts the winner's cycle) instead of surfacing a raw P2002. There are TWO:
 *   - `@@unique([appointment_id, cycle_number])` → target `['appointment_id','cycle_number']`;
 *   - the partial unique `appointment_active_cycle_unique ON (appointment_id)
 *     WHERE status <> 'SUPERSEDED'` (one active cycle per appointment) → Prisma may
 *     report the column (`appointment_id`) or the raw index name, so both are listed.
 */
export const CYCLE_UNIQUE_CONSTRAINT_COLUMNS = [
  'cycle_number',
  'appointment_id',
  'appointment_active_cycle_unique',
];

export class ConfirmationCycleService {
  constructor(
    private readonly cycleRepo: IConfirmationCycleRepository,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Inserts first PENDING cycle OR links existing active cycle to new token.
   * Called inside outer tx from GeneratePortalTokenUseCase.
   *
   * P2002 concurrent-insert race: when this service owns the transaction it
   * retries once via a fresh `$transaction`. When it was handed a caller-owned
   * `tx`, Postgres has already aborted that transaction, so it cannot retry
   * inside it — it rethrows the original P2002 for the transaction owner
   * (GeneratePortalTokenUseCase) to replay in a fresh transaction.
   */
  async createInitial(
    appointmentId: string,
    tenantId: string,
    scheduledDate: Date,
    timeSlot: string | null,
    tokenId: string | null,
    tx?: Tx,
    defer?: Defer,
    auditContext?: ConfirmationResetAuditContext,
  ): Promise<ConfirmationCycleEntity> {
    const run = async (client: Tx): Promise<ConfirmationCycleEntity> => {
      const active = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);

      if (active) {
        if (active.isTerminal()) {
          throw new ConfirmationCycleAlreadyTerminalError();
        }

        // O-11 (decision 2 regression): a new link for an appointment whose active
        // cycle records the rental tenant as UNAVAILABLE ("can't attend") must
        // RE-OPEN the confirmation to PENDING, not merely attach the token to the
        // UNAVAILABLE cycle. Before option B an UNAVAILABLE appointment had no cycle,
        // so this reopen happened in the no-active branch below; option B made "can't"
        // durable as an active UNAVAILABLE cycle, which made that reopen unreachable.
        // Mirror rotateOnDateChange / group rule 3: supersede the UNAVAILABLE cycle
        // (preserving it as history) and open a fresh PENDING cycle linked to the new
        // token, then audit the reset on the appointment. (NO_RESPONSE never carries
        // an active cycle — invalidateOnReject clears it — so it reopens below.)
        if (active.status === 'UNAVAILABLE') {
          await this.supersedeCurrent(appointmentId, tenantId, 'APPOINTMENT_REOPENED', client, defer);
          const reopened = await this.createCycleWith(
            client,
            appointmentId,
            tenantId,
            'PENDING',
            null,
            tokenId,
            scheduledDate,
            timeSlot,
            defer,
          );
          this.logAppointmentReset(appointmentId, tenantId, 'UNAVAILABLE', 'PENDING', auditContext, defer);
          return reopened;
        }

        if (active.status === 'PENDING') {
          const existingDate = active.scheduledDate.toISOString().slice(0, 10);
          const newDate = scheduledDate.toISOString().slice(0, 10);
          if (existingDate !== newDate || active.timeSlot !== timeSlot) {
            throw new ConfirmationCycleStateError(
              'createInitial called with mismatched (scheduledDate, timeSlot) — call rotateOnDateChange first',
            );
          }
        }

        // Link new token to existing active cycle
        const linked = this.withUpdatedToken(active, tokenId);
        await this.cycleRepo.update(linked, client);
        await this.linkTokenToCycle(tokenId, active.id, client);
        return linked;
      }

      // No active cycle (O-11, option A): adopt an existing confirmation instead of
      // silently resetting it. Read the appointment's current denorm status in the
      // same transaction — if it is CONFIRMED, open the first cycle ALREADY
      // CONFIRMED (source unknown → null) and keep the status, so generating a
      // portal link no longer undoes a confirmation. Any other status
      // (PENDING / UNAVAILABLE / NO_RESPONSE) opens a fresh PENDING cycle exactly
      // as before — a new link re-opens an UNAVAILABLE/NO_RESPONSE confirmation
      // (decision 2). A real status change is audited on the appointment (option C).
      const current = await this.readAppointmentConfirmation(appointmentId, client);
      const beforeStatus = current?.status ?? 'PENDING';
      const targetStatus = beforeStatus === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING';

      const cycle = await this.createCycleWith(
        client,
        appointmentId,
        tenantId,
        targetStatus,
        null,
        tokenId,
        scheduledDate,
        timeSlot,
        defer,
      );
      this.logAppointmentReset(appointmentId, tenantId, beforeStatus, targetStatus, auditContext, defer);

      return cycle;
    };

    try {
      if (tx) return await run(tx);
      return await this.prisma.$transaction(run);
    } catch (err: unknown) {
      // Target-specific: only a cycle uniqueness collision (cycle_number OR the
      // active-cycle appointment_id index) is recoverable here; any other P2002
      // propagates so it is never silently swallowed.
      if (!isUniqueConflictOn(err, CYCLE_UNIQUE_CONSTRAINT_COLUMNS)) throw err;
      // A caller-owned tx is already aborted by the P2002 (Postgres 25P02), so
      // retrying inside it is impossible. Rethrow the original error and let the
      // transaction owner replay the whole transaction in a fresh one.
      if (tx) throw err;
      // Self-owned: retry once via a fresh transaction, linking to the existing cycle.
      const retry = async (client: Tx): Promise<ConfirmationCycleEntity> => {
        const existing = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);
        if (!existing) throw err;
        const linked = this.withUpdatedToken(existing, tokenId);
        await this.cycleRepo.update(linked, client);
        await this.linkTokenToCycle(tokenId, existing.id, client);
        return linked;
      };
      return await this.prisma.$transaction(retry);
    }
  }

  /**
   * Supersedes active cycle and creates new PENDING cycle for date change.
   * Defensive infrastructure — no caller in this PR (editability gate blocks SCHEDULED edits).
   */
  async rotateOnDateChange(
    appointmentId: string,
    tenantId: string,
    newDate: Date,
    newTimeSlot: string | null,
    reason: 'DATE_CHANGED' | 'TIME_CHANGED',
    tx?: Tx,
    defer?: Defer,
    auditContext?: ConfirmationResetAuditContext,
  ): Promise<ConfirmationCycleEntity> {
    const run = async (client: Tx): Promise<ConfirmationCycleEntity> => {
      // O-11 (option C): capture the status being reset so the appointment-level
      // audit records before→after + the operator + the cause (group portal-link
      // resend). Read before superseding, while the denorm still holds it.
      const current = await this.readAppointmentConfirmation(appointmentId, client);
      const beforeStatus = current?.status ?? 'PENDING';

      await this.supersedeCurrent(appointmentId, tenantId, reason, client, defer);

      const maxCycleNumber = await this.cycleRepo.findMaxCycleNumber(appointmentId, client);
      const cycle = new ConfirmationCycleEntity({
        id: crypto.randomUUID(),
        appointmentId,
        cycleNumber: maxCycleNumber + 1,
        scheduledDate: newDate,
        timeSlot: newTimeSlot,
        status: 'PENDING',
        confirmationSource: null,
        confirmedAt: null,
        invalidatedAt: null,
        invalidatedReason: null,
        portalTokenId: null,
        createdAt: new Date(),
      });
      await this.cycleRepo.save(cycle, client);
      await this.setAppointmentActiveCycle(appointmentId, tenantId, cycle.id, 'PENDING', client);
      this.logAppointmentReset(appointmentId, tenantId, beforeStatus, 'PENDING', auditContext, defer);

      this.logAfterCommit(defer, {
        action: 'appointment_confirmation_cycle.rotated',
        actorType: 'SYSTEM',
        entityType: 'AppointmentConfirmationCycle',
        entityId: cycle.id,
        tenantId,
        after: { cycleNumber: cycle.cycleNumber, status: 'PENDING', reason },
      });

      return cycle;
    };
    if (tx) return await run(tx);
    return await this.prisma.$transaction(run);
  }

  /**
   * Moves the active cycle onto a new schedule, keeping its status.
   *
   * The counterpart to `rotateOnDateChange` for the case where an operator moves
   * a group's schedule and explicitly chooses to keep the tenants' confirmations
   * rather than ask for them again. Without this the confirmation survives but
   * stays pinned to the old date, so it reads as stale to every later
   * portal-link plan and the operator's choice quietly decays into a resend.
   *
   * No-ops when there is no active cycle — an appointment nobody ever confirmed
   * has nothing to realign.
   */
  async realignActiveCycleSchedule(
    appointmentId: string,
    tenantId: string,
    newDate: Date,
    newTimeSlot: string | null,
    tx?: Tx,
  ): Promise<void> {
    // Read-then-write, so the pair runs in one transaction like every sibling
    // here — otherwise a concurrent rotation could supersede the cycle between
    // the lookup and the update.
    const run = async (client: Tx): Promise<void> => {
      const active = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);
      if (!active) return;

      await this.cycleRepo.realignSchedule(active.id, tenantId, newDate, newTimeSlot, client);

      this.auditService.log({
        action: 'appointment_confirmation_cycle.updated',
        actorType: 'SYSTEM',
        entityType: 'AppointmentConfirmationCycle',
        entityId: active.id,
        tenantId,
        before: { scheduledDate: active.scheduledDate, timeSlot: active.timeSlot },
        after: { scheduledDate: newDate, timeSlot: newTimeSlot, reason: 'SCHEDULE_REALIGNED' },
      });
    };
    if (tx) return await run(tx);
    return await this.prisma.$transaction(run);
  }

  /**
   * Marks active cycle CONFIRMED and updates the denorm cache.
   * Idempotent if cycle is already CONFIRMED.
   */
  async confirm(
    appointmentId: string,
    tenantId: string,
    source: 'RENTAL_TENANT_PORTAL' | 'OPERATOR_FORCED',
    tokenId: string | null,
    tx?: Tx,
  ): Promise<ConfirmationCycleEntity> {
    const run = async (client: Tx): Promise<ConfirmationCycleEntity> => {
      const active = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);
      if (active) {
        if (active.status === 'CONFIRMED') return active;
        if (active.isTerminal()) throw new ConfirmationCycleAlreadyTerminalError();

        const updated = active.markConfirmed(source as CycleConfirmationSource, tokenId);
        await this.cycleRepo.update(updated, client);
        await this.setAppointmentActiveCycle(appointmentId, tenantId, active.id, 'CONFIRMED', client);
        this.emitCycleAudit(tenantId, active, updated);
        return updated;
      }

      // O-11 (option B): no cycle yet — the confirmation arrived via the automatic
      // SCHEDULED email, an admin force-confirm, or a group join, none of which
      // opened a cycle. CREATE the cycle already CONFIRMED (its real source) instead
      // of throwing ConfirmationCycleNotFoundError, so the confirmation is durable
      // and a later portal link adopts it rather than resetting it.
      const appt = await this.readAppointmentConfirmation(appointmentId, client);
      if (!appt) throw new ConfirmationCycleNotFoundError();
      return this.createCycleWith(
        client,
        appointmentId,
        tenantId,
        'CONFIRMED',
        source as CycleConfirmationSource,
        tokenId,
        appt.scheduledDate,
        appt.timeSlot,
        undefined,
      );
    };
    // Self-owned calls (every caller today) replay a concurrent cycle_number race;
    // a caller-owned tx cannot retry in place (Postgres aborts it) so it rethrows.
    if (tx) return await run(tx);
    return await retryOnUniqueConflict(CYCLE_UNIQUE_CONSTRAINT_COLUMNS, () => this.prisma.$transaction(run));
  }

  /**
   * Marks active cycle UNAVAILABLE and updates the denorm cache.
   * Idempotent if cycle is already UNAVAILABLE.
   */
  async markUnavailable(appointmentId: string, tenantId: string, tx?: Tx): Promise<ConfirmationCycleEntity> {
    const run = async (client: Tx): Promise<ConfirmationCycleEntity> => {
      const active = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);
      if (active) {
        if (active.status === 'UNAVAILABLE') return active;
        if (active.isTerminal()) throw new ConfirmationCycleAlreadyTerminalError();

        const updated = active.markUnavailable();
        await this.cycleRepo.update(updated, client);
        await this.setAppointmentActiveCycle(appointmentId, tenantId, active.id, 'UNAVAILABLE', client);
        this.emitCycleAudit(tenantId, active, updated);
        return updated;
      }

      // O-11 (option B): no cycle yet — create it already UNAVAILABLE instead of
      // throwing, so "can't attend" is durable even when it is the tenant's first
      // response and no manual link ever opened a cycle.
      const appt = await this.readAppointmentConfirmation(appointmentId, client);
      if (!appt) throw new ConfirmationCycleNotFoundError();
      return this.createCycleWith(
        client,
        appointmentId,
        tenantId,
        'UNAVAILABLE',
        null,
        null,
        appt.scheduledDate,
        appt.timeSlot,
        undefined,
      );
    };
    if (tx) return await run(tx);
    return await retryOnUniqueConflict(CYCLE_UNIQUE_CONSTRAINT_COLUMNS, () => this.prisma.$transaction(run));
  }

  /**
   * Supersedes active cycle and resets denorm to PENDING.
   * No-op when no active cycle exists (idempotent).
   * Used when appointment returns to DRAFT via any path.
   */
  async invalidateOnReopen(appointmentId: string, tenantId: string, tx?: Tx): Promise<void> {
    const run = async (client: Tx): Promise<void> => {
      await this.supersedeCurrent(appointmentId, tenantId, 'APPOINTMENT_REOPENED', client);
      await this.clearAppointmentActiveCycle(appointmentId, tenantId, 'PENDING', client);
    };
    if (tx) return await run(tx);
    return await this.prisma.$transaction(run);
  }

  /**
   * Supersedes active cycle and sets denorm to NO_RESPONSE.
   * No-op when no active cycle exists (idempotent).
   * Called by reject-unconfirmed worker inside its outer per-appointment tx.
   */
  async invalidateOnReject(appointmentId: string, tenantId: string, tx?: Tx): Promise<void> {
    const run = async (client: Tx): Promise<void> => {
      await this.supersedeCurrent(appointmentId, tenantId, 'APPOINTMENT_REOPENED', client);
      await this.clearAppointmentActiveCycle(appointmentId, tenantId, 'NO_RESPONSE', client);
    };
    if (tx) return await run(tx);
    return await this.prisma.$transaction(run);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private logAfterCommit(defer: Defer | undefined, entry: Parameters<AuditService['log']>[0]): void {
    if (defer) {
      defer(async () => {
        this.auditService.log(entry);
      });
      return;
    }
    this.auditService.log(entry);
  }

  /**
   * Reads the appointment's denorm confirmation status and its current schedule in
   * the same transaction. Used by createInitial/confirm/markUnavailable to adopt an
   * existing confirmation (O-11) and to open a cycle pinned to the real date/slot.
   */
  private async readAppointmentConfirmation(
    appointmentId: string,
    client: Tx,
  ): Promise<{ status: string; scheduledDate: Date; timeSlot: string } | null> {
    const row = await (client as unknown as PrismaClient).appointment.findUnique({
      where: { id: appointmentId },
      select: {
        rental_tenant_confirmation_status: true,
        scheduled_date: true,
        time_slot_start: true,
        time_slot_end: true,
      },
    });
    if (!row) return null;
    return {
      status: row.rental_tenant_confirmation_status as unknown as string,
      scheduledDate: row.scheduled_date,
      timeSlot: `${row.time_slot_start}-${row.time_slot_end}`,
    };
  }

  /**
   * Opens a fresh cycle with the given status and syncs the denorm cache. Shared by
   * createInitial (PENDING/adopted-CONFIRMED) and confirm/markUnavailable (O-11
   * option B: a confirmation/unavailability that arrived before any cycle existed).
   */
  private async createCycleWith(
    client: Tx,
    appointmentId: string,
    tenantId: string,
    status: 'PENDING' | 'CONFIRMED' | 'UNAVAILABLE',
    source: CycleConfirmationSource | null,
    tokenId: string | null,
    scheduledDate: Date,
    timeSlot: string | null,
    defer: Defer | undefined,
  ): Promise<ConfirmationCycleEntity> {
    const maxCycleNumber = await this.cycleRepo.findMaxCycleNumber(appointmentId, client);
    const now = new Date();
    const cycle = new ConfirmationCycleEntity({
      id: crypto.randomUUID(),
      appointmentId,
      cycleNumber: maxCycleNumber + 1,
      scheduledDate,
      timeSlot,
      status,
      confirmationSource: source,
      confirmedAt: status === 'CONFIRMED' ? now : null,
      invalidatedAt: null,
      invalidatedReason: null,
      portalTokenId: tokenId,
      createdAt: now,
    });
    await this.cycleRepo.save(cycle, client);
    await this.setAppointmentActiveCycle(appointmentId, tenantId, cycle.id, status, client);
    await this.linkTokenToCycle(tokenId, cycle.id, client);
    this.logAfterCommit(defer, {
      action: 'appointment_confirmation_cycle.created',
      actorType: 'SYSTEM',
      entityType: 'AppointmentConfirmationCycle',
      entityId: cycle.id,
      tenantId,
      after: { cycleNumber: cycle.cycleNumber, status },
    });
    return cycle;
  }

  /**
   * O-11 option C: when a portal-link operation changes the appointment's
   * confirmation status, record it ON THE APPOINTMENT (entityId = appointment) so
   * the web timeline shows it, with before/after, the operator and the cause. A
   * no-op when nothing changed (adoption) or no audit context was supplied.
   */
  private logAppointmentReset(
    appointmentId: string,
    tenantId: string,
    before: string,
    after: string,
    auditContext: ConfirmationResetAuditContext | undefined,
    defer: Defer | undefined,
  ): void {
    if (!auditContext || before === after) return;
    this.logAfterCommit(defer, {
      action: CONFIRMATION_RESET_AUDIT_ACTION,
      actorType: 'USER',
      actorId: auditContext.actorId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId,
      before: { rentalTenantConfirmationStatus: before },
      after: { rentalTenantConfirmationStatus: after },
      metadata: { cause: auditContext.cause },
    });
  }

  private async supersedeCurrent(
    appointmentId: string,
    tenantId: string,
    reason: Parameters<ConfirmationCycleEntity['markSuperseded']>[0],
    client: Tx,
    defer?: Defer,
  ): Promise<void> {
    const active = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);
    if (!active) return;
    const superseded = active.markSuperseded(reason);
    await this.cycleRepo.update(superseded, client);
    // Mark the associated portal token as SUPERSEDED so the middleware rejects it.
    if (active.portalTokenId) {
      await (client as unknown as PrismaClient).rentalTenantPortalToken.update({
        where: { id: active.portalTokenId },
        data: { status: 'SUPERSEDED' as never },
      });
    }
    this.emitCycleAudit(tenantId, active, superseded, defer);
  }

  private async setAppointmentActiveCycle(
    appointmentId: string,
    tenantId: string,
    cycleId: string,
    denormStatus: string,
    tx: Tx,
  ): Promise<void> {
    await (tx as unknown as PrismaClient).appointment.updateMany({
      where: { id: appointmentId, tenant_id: tenantId },
      data: {
        active_confirmation_cycle_id: cycleId,
        rental_tenant_confirmation_status: denormStatus as never,
      },
    });
  }

  private async clearAppointmentActiveCycle(
    appointmentId: string,
    tenantId: string,
    denormStatus: string,
    tx: Tx,
  ): Promise<void> {
    await (tx as unknown as PrismaClient).appointment.updateMany({
      where: { id: appointmentId, tenant_id: tenantId },
      data: {
        active_confirmation_cycle_id: null,
        rental_tenant_confirmation_status: denormStatus as never,
      },
    });
  }

  private async linkTokenToCycle(
    tokenId: string | null,
    cycleId: string,
    tx: Tx,
  ): Promise<void> {
    if (!tokenId) return;
    await (tx as unknown as PrismaClient).rentalTenantPortalToken.update({
      where: { id: tokenId },
      data: { confirmation_cycle_id: cycleId },
    });
  }

  private withUpdatedToken(cycle: ConfirmationCycleEntity, tokenId: string | null): ConfirmationCycleEntity {
    return new ConfirmationCycleEntity({
      id: cycle.id,
      appointmentId: cycle.appointmentId,
      cycleNumber: cycle.cycleNumber,
      scheduledDate: cycle.scheduledDate,
      timeSlot: cycle.timeSlot,
      status: cycle.status,
      confirmationSource: cycle.confirmationSource,
      confirmedAt: cycle.confirmedAt,
      invalidatedAt: cycle.invalidatedAt,
      invalidatedReason: cycle.invalidatedReason,
      portalTokenId: tokenId ?? cycle.portalTokenId,
      createdAt: cycle.createdAt,
    });
  }

  private emitCycleAudit(
    tenantId: string,
    before: ConfirmationCycleEntity,
    after: ConfirmationCycleEntity,
    defer?: Defer,
  ): void {
    this.logAfterCommit(defer, {
      action: 'appointment_confirmation_cycle.updated',
      actorType: 'SYSTEM',
      entityType: 'AppointmentConfirmationCycle',
      entityId: after.id,
      tenantId,
      before: { status: before.status },
      after: {
        status: after.status,
        confirmationSource: after.confirmationSource,
        invalidatedReason: after.invalidatedReason,
      },
    });
  }

}
