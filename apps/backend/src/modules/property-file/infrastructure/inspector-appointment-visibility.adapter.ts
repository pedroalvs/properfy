import type { IAppointmentRepository } from '../../appointment/domain/appointment.repository';
import type { IServiceTypeReader } from '../../inspector-execution/domain/service-type-reader';
import { T1VisibilityService } from '../../inspector-execution/domain/t1-visibility.service';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../shared/domain/timezone-date';
import type { ITenantTimezoneLookup } from '../../../shared/application/tenant-timezone';
import type { Clock } from '../../../shared/domain/clock';
import type {
  IInspectorAppointmentVisibility,
  InspectorVisibleAppointment,
} from '../domain/inspector-appointment-visibility';

/**
 * Mirrors the gating in `GetAppointmentDetailUseCase` (inspector-execution): the
 * appointment must be assigned to the inspector, be SCHEDULED or DONE, and — for
 * SCHEDULED — pass the T-1 visibility rule in the agency timezone.
 */
export class InspectorAppointmentVisibilityAdapter implements IInspectorAppointmentVisibility {
  private readonly t1 = new T1VisibilityService();

  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly serviceTypeReader: IServiceTypeReader,
    private readonly tenantTimezoneLookup: ITenantTimezoneLookup,
    private readonly clock: Clock,
  ) {}

  async resolveForInspector(
    appointmentId: string,
    inspectorId: string,
  ): Promise<InspectorVisibleAppointment | null> {
    // Inspectors are cross-tenant — load without a tenant predicate.
    const result = await this.appointmentRepo.findById(appointmentId, null);
    if (!result) return null;
    const { appointment } = result;

    if (appointment.inspectorId !== inspectorId) return null;
    if (appointment.status !== 'SCHEDULED' && appointment.status !== 'DONE') return null;

    if (appointment.status === 'SCHEDULED') {
      const st = await this.serviceTypeReader.findById(appointment.serviceTypeId);
      const flowType = st?.flowType ?? 'ROUTINE';
      const agencyTz =
        (await this.tenantTimezoneLookup.getTenantTimezone(appointment.tenantId)) ??
        PLATFORM_TIMEZONE;
      const todayCivil = civilDateInTimezone(this.clock.now(), agencyTz);
      const visible = this.t1.isVisibleForInspector(
        flowType,
        appointment.rentalTenantConfirmationStatus,
        appointment.keyRequired,
        appointment.scheduledDate,
        todayCivil,
      );
      if (!visible) return null;
    }

    return { propertyId: appointment.propertyId, tenantId: appointment.tenantId };
  }
}
