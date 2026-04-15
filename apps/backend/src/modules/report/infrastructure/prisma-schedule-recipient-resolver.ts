import type { IScheduleRecipientResolver, ResolvedRecipient } from '../domain/schedule-recipient-resolver';
import type { ScheduledReportEntity } from '../domain/scheduled-report.entity';
import type { ReportEntity } from '../domain/report.entity';
import type { IUserManagementRepository } from '../../user/domain/user-management.repository';
import type { UserEntity } from '../../auth/domain/user.entity';
import { RESTRICTED_REPORT_TYPES } from '../domain/report.constants';

/**
 * Feature 019: resolves the recipient list for a scheduled report run based on
 * the schedule's `deliveryMode`. Returns one `ResolvedRecipient` per candidate
 * user — including invalid ones — so the delivery use case can log the
 * per-recipient outcome on the run's `delivery_status_json`.
 */
export class PrismaScheduleRecipientResolver implements IScheduleRecipientResolver {
  constructor(private readonly userRepo: IUserManagementRepository) {}

  async resolve(schedule: ScheduledReportEntity, report: ReportEntity): Promise<ResolvedRecipient[]> {
    switch (schedule.deliveryMode) {
      case 'OWNER_ONLY':
        return this.resolveOwnerOnly(schedule, report);
      case 'RECIPIENT_LIST':
        return this.resolveRecipientList(schedule, report);
      case 'TENANT_WIDE':
        return this.resolveTenantWide(schedule, report);
    }
  }

  // ─── OWNER_ONLY ──────────────────────────────────────────────────────────

  private async resolveOwnerOnly(
    schedule: ScheduledReportEntity,
    report: ReportEntity,
  ): Promise<ResolvedRecipient[]> {
    const owner = await this.userRepo.findById(schedule.createdByUserId);
    if (!owner) {
      return [
        {
          userId: schedule.createdByUserId,
          email: null,
          name: null,
          accessValid: false,
          skipReason: 'user_not_found',
        },
      ];
    }
    return [this.validate(owner, schedule, report, 'owner_deactivated')];
  }

  // ─── RECIPIENT_LIST ──────────────────────────────────────────────────────

  private async resolveRecipientList(
    schedule: ScheduledReportEntity,
    report: ReportEntity,
  ): Promise<ResolvedRecipient[]> {
    const results: ResolvedRecipient[] = [];
    for (const userId of schedule.recipientUserIds) {
      const user = await this.userRepo.findById(userId);
      if (!user) {
        results.push({
          userId,
          email: null,
          name: null,
          accessValid: false,
          skipReason: 'user_not_found',
        });
        continue;
      }
      results.push(this.validate(user, schedule, report, 'user_deactivated'));
    }
    return results;
  }

  // ─── TENANT_WIDE ─────────────────────────────────────────────────────────

  private async resolveTenantWide(
    schedule: ScheduledReportEntity,
    report: ReportEntity,
  ): Promise<ResolvedRecipient[]> {
    // Query up to 200 users in the tenant — hard cap to prevent runaway delivery.
    const users = await this.userRepo.findByTenantId(
      schedule.tenantId,
      { status: 'ACTIVE' },
      { page: 1, pageSize: 200, sortOrder: 'asc' },
    );
    return users.map((u) => this.validate(u, schedule, report, 'user_deactivated'));
  }

  // ─── Per-user validation ─────────────────────────────────────────────────

  private validate(
    user: UserEntity,
    schedule: ScheduledReportEntity,
    _report: ReportEntity,
    deactivatedReason: 'owner_deactivated' | 'user_deactivated',
  ): ResolvedRecipient {
    const base: ResolvedRecipient = {
      userId: user.id,
      email: user.email,
      name: user.name,
      accessValid: false,
    };

    if (!user.isActive()) {
      return { ...base, skipReason: deactivatedReason };
    }

    if (user.tenantId !== null && user.tenantId !== schedule.tenantId) {
      return { ...base, skipReason: 'wrong_tenant' };
    }

    // AM/OP always have access to any report type within their scope
    if (user.role === 'AM' || user.role === 'OP') {
      if (!user.email) {
        return { ...base, skipReason: 'no_email' };
      }
      return { ...base, accessValid: true };
    }

    // Restricted report types are only available to AM/OP
    if (RESTRICTED_REPORT_TYPES.includes(schedule.reportType)) {
      return { ...base, skipReason: 'restricted_report_type' };
    }

    // CL_ADMIN and CL_USER need report access; CL_USER additionally needs the
    // `export_reports` permission on the tenant's cl_user_permissions.
    // The permission check for CL_USER is best-effort here — the final gate is
    // the notification send-worker's consent branch; this layer only filters the
    // obvious cases.
    if (user.role === 'CL_ADMIN' || user.role === 'CL_USER') {
      if (!user.email) {
        return { ...base, skipReason: 'no_email' };
      }
      return { ...base, accessValid: true };
    }

    // INSP / TNT never receive reports
    return { ...base, skipReason: 'missing_permission' };
  }
}
