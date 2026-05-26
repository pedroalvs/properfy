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

type Tx = Prisma.TransactionClient;

export class ConfirmationCycleService {
  constructor(
    private readonly cycleRepo: IConfirmationCycleRepository,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Inserts first PENDING cycle OR links existing active cycle to new token.
   * Called inside outer tx from GeneratePortalTokenUseCase.
   * Handles P2002 concurrent-insert race via retry-once.
   */
  async createInitial(
    appointmentId: string,
    tenantId: string,
    scheduledDate: Date,
    timeSlot: string | null,
    tokenId: string | null,
    tx?: Tx,
  ): Promise<ConfirmationCycleEntity> {
    const exec = async (client: Tx): Promise<ConfirmationCycleEntity> => {
      const active = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);

      if (active) {
        if (active.isTerminal()) {
          throw new ConfirmationCycleAlreadyTerminalError();
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

      // No active cycle — create new PENDING one
      const maxCycleNumber = await this.cycleRepo.findMaxCycleNumber(appointmentId, client);
      const now = new Date();
      const cycle = new ConfirmationCycleEntity({
        id: crypto.randomUUID(),
        appointmentId,
        cycleNumber: maxCycleNumber + 1,
        scheduledDate,
        timeSlot,
        status: 'PENDING',
        confirmationSource: null,
        confirmedAt: null,
        invalidatedAt: null,
        invalidatedReason: null,
        portalTokenId: tokenId,
        createdAt: now,
      });

      await this.cycleRepo.save(cycle, client);
      await this.setAppointmentActiveCycle(appointmentId, tenantId, cycle.id, 'PENDING', client);
      await this.linkTokenToCycle(tokenId, cycle.id, client);

      this.auditService.log({
        action: 'appointment_confirmation_cycle.created',
        actorType: 'SYSTEM',
        entityType: 'AppointmentConfirmationCycle',
        entityId: cycle.id,
        tenantId,
        after: { cycleNumber: cycle.cycleNumber, status: 'PENDING' },
      });

      return cycle;
    };

    try {
      if (tx) return await exec(tx);
      return await this.prisma.$transaction(exec);
    } catch (err: unknown) {
      if (!this.isUniqueViolation(err)) throw err;
      // P2002: concurrent createInitial race — retry once via link-to-existing
      const retry = async (client: Tx): Promise<ConfirmationCycleEntity> => {
        const existing = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);
        if (!existing) throw err;
        const linked = this.withUpdatedToken(existing, tokenId);
        await this.cycleRepo.update(linked, client);
        await this.linkTokenToCycle(tokenId, existing.id, client);
        return linked;
      };
      if (tx) return await retry(tx);
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
  ): Promise<ConfirmationCycleEntity> {
    const exec = async (client: Tx): Promise<ConfirmationCycleEntity> => {
      await this.supersedeCurrent(appointmentId, tenantId, reason, client);

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

      this.auditService.log({
        action: 'appointment_confirmation_cycle.rotated',
        actorType: 'SYSTEM',
        entityType: 'AppointmentConfirmationCycle',
        entityId: cycle.id,
        tenantId,
        after: { cycleNumber: cycle.cycleNumber, status: 'PENDING', reason },
      });

      return cycle;
    };
    if (tx) return await exec(tx);
    return await this.prisma.$transaction(exec);
  }

  /**
   * Supersedes active cycle and creates new CONFIRMED cycle.
   * Used when tenant reschedules via portal (they implicitly confirm the new date).
   */
  async rotateOnTenantReschedule(
    appointmentId: string,
    tenantId: string,
    newDate: Date,
    newTimeSlot: string | null,
    tx?: Tx,
  ): Promise<ConfirmationCycleEntity> {
    const exec = async (client: Tx): Promise<ConfirmationCycleEntity> => {
      await this.supersedeCurrent(appointmentId, tenantId, 'TENANT_RESCHEDULE', client);

      const maxCycleNumber = await this.cycleRepo.findMaxCycleNumber(appointmentId, client);
      const now = new Date();
      const cycle = new ConfirmationCycleEntity({
        id: crypto.randomUUID(),
        appointmentId,
        cycleNumber: maxCycleNumber + 1,
        scheduledDate: newDate,
        timeSlot: newTimeSlot,
        status: 'CONFIRMED',
        confirmationSource: 'TENANT_RESCHEDULE',
        confirmedAt: now,
        invalidatedAt: null,
        invalidatedReason: null,
        portalTokenId: null,
        createdAt: now,
      });
      await this.cycleRepo.save(cycle, client);
      await this.setAppointmentActiveCycle(appointmentId, tenantId, cycle.id, 'CONFIRMED', client);

      this.auditService.log({
        action: 'appointment_confirmation_cycle.rotated',
        actorType: 'ANONYMOUS',
        entityType: 'AppointmentConfirmationCycle',
        entityId: cycle.id,
        tenantId,
        after: { cycleNumber: cycle.cycleNumber, status: 'CONFIRMED', source: 'TENANT_RESCHEDULE' },
      });

      return cycle;
    };
    if (tx) return await exec(tx);
    return await this.prisma.$transaction(exec);
  }

  /**
   * Marks active cycle CONFIRMED and updates the denorm cache.
   * Idempotent if cycle is already CONFIRMED.
   */
  async confirm(
    appointmentId: string,
    tenantId: string,
    source: 'TENANT_PORTAL' | 'OPERATOR_FORCED',
    tokenId: string | null,
    tx?: Tx,
  ): Promise<ConfirmationCycleEntity> {
    const exec = async (client: Tx): Promise<ConfirmationCycleEntity> => {
      const active = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);
      if (!active) throw new ConfirmationCycleNotFoundError();
      if (active.status === 'CONFIRMED') return active;
      if (active.isTerminal()) throw new ConfirmationCycleAlreadyTerminalError();

      const updated = active.markConfirmed(source as CycleConfirmationSource, tokenId);
      await this.cycleRepo.update(updated, client);
      await this.setAppointmentActiveCycle(appointmentId, tenantId, active.id, 'CONFIRMED', client);
      this.emitCycleAudit(tenantId, active, updated);
      return updated;
    };
    if (tx) return await exec(tx);
    return await this.prisma.$transaction(exec);
  }

  /**
   * Marks active cycle UNAVAILABLE and updates the denorm cache.
   * Idempotent if cycle is already UNAVAILABLE.
   */
  async markUnavailable(appointmentId: string, tenantId: string, tx?: Tx): Promise<ConfirmationCycleEntity> {
    const exec = async (client: Tx): Promise<ConfirmationCycleEntity> => {
      const active = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);
      if (!active) throw new ConfirmationCycleNotFoundError();
      if (active.status === 'UNAVAILABLE') return active;
      if (active.isTerminal()) throw new ConfirmationCycleAlreadyTerminalError();

      const updated = active.markUnavailable();
      await this.cycleRepo.update(updated, client);
      await this.setAppointmentActiveCycle(appointmentId, tenantId, active.id, 'UNAVAILABLE', client);
      this.emitCycleAudit(tenantId, active, updated);
      return updated;
    };
    if (tx) return await exec(tx);
    return await this.prisma.$transaction(exec);
  }

  /**
   * Supersedes active cycle and resets denorm to PENDING.
   * No-op when no active cycle exists (idempotent).
   * Used when appointment returns to DRAFT via any path.
   */
  async invalidateOnReopen(appointmentId: string, tenantId: string, tx?: Tx): Promise<void> {
    const exec = async (client: Tx): Promise<void> => {
      const active = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);
      if (!active) return;
      const superseded = active.markSuperseded('APPOINTMENT_REOPENED');
      await this.cycleRepo.update(superseded, client);
      await this.clearAppointmentActiveCycle(appointmentId, tenantId, 'PENDING', client);
      this.emitCycleAudit(tenantId, active, superseded);
    };
    if (tx) return await exec(tx);
    return await this.prisma.$transaction(exec);
  }

  /**
   * Supersedes active cycle and sets denorm to NO_RESPONSE.
   * No-op when no active cycle exists (idempotent).
   * Called by reject-unconfirmed worker inside its outer per-appointment tx.
   */
  async invalidateOnReject(appointmentId: string, tenantId: string, tx?: Tx): Promise<void> {
    const exec = async (client: Tx): Promise<void> => {
      const active = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);
      if (!active) return;
      const superseded = active.markSuperseded('APPOINTMENT_REOPENED');
      await this.cycleRepo.update(superseded, client);
      await this.clearAppointmentActiveCycle(appointmentId, tenantId, 'NO_RESPONSE', client);
      this.emitCycleAudit(tenantId, active, superseded);
    };
    if (tx) return await exec(tx);
    return await this.prisma.$transaction(exec);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async supersedeCurrent(
    appointmentId: string,
    tenantId: string,
    reason: Parameters<ConfirmationCycleEntity['markSuperseded']>[0],
    client: Tx,
  ): Promise<void> {
    const active = await this.cycleRepo.findActiveByAppointmentId(appointmentId, client);
    if (!active) return;
    const superseded = active.markSuperseded(reason);
    await this.cycleRepo.update(superseded, client);
    // Mark the associated portal token as SUPERSEDED so the middleware rejects it.
    if (active.portalTokenId) {
      await (client as unknown as PrismaClient).tenantPortalToken.update({
        where: { id: active.portalTokenId },
        data: { status: 'SUPERSEDED' as never },
      });
    }
    this.emitCycleAudit(tenantId, active, superseded);
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
        tenant_confirmation_status: denormStatus as never,
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
        tenant_confirmation_status: denormStatus as never,
      },
    });
  }

  private async linkTokenToCycle(
    tokenId: string | null,
    cycleId: string,
    tx: Tx,
  ): Promise<void> {
    if (!tokenId) return;
    await (tx as unknown as PrismaClient).tenantPortalToken.update({
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
  ): void {
    this.auditService.log({
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

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    );
  }
}
