import type { AuthContext, AppointmentApp } from '@properfy/shared';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../appointment/domain/appointment.repository';
import type { IAppCredentialRepository } from '../../../app-credential/domain/app-credential.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { IInspectionExecutionRepository } from '../../domain/inspection-execution.repository';
import type { IInspectionAssetRepository } from '../../domain/inspection-asset.repository';
import type { IServiceTypeReader } from '../../domain/service-type-reader';
import { T1VisibilityService } from '../../domain/t1-visibility.service';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionT1BlockedError,
} from '../../domain/inspection-execution.errors';

export interface GetAppointmentDetailInput {
  appointmentId: string;
  actor: AuthContext;
}

export interface JobDetailsAgency {
  id: string;
  name: string;
}

export interface JobDetailsTenantContact {
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  isPrimary: boolean;
}

export interface JobDetailsKeys {
  keyRequired: boolean;
  keyLocation: string | null;
}

export interface JobDetailsKeyLocation {
  address: string;
  mapLinkUrl: string;
}

export interface JobDetailsPropertyManager {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
}

export interface JobDetailsPayment {
  payoutAmount: number;
  currency: string;
}

export interface JobDetailsInspectionAppLink {
  url: string;
  label: string;
}

export interface JobDetails {
  agency: JobDetailsAgency;
  tenantContacts: JobDetailsTenantContact[];
  keys: JobDetailsKeys;
  keyLocation?: JobDetailsKeyLocation;
  propertyManager: JobDetailsPropertyManager | null;
  payment: JobDetailsPayment;
  inspectionAppLink?: JobDetailsInspectionAppLink;
}

export interface AppointmentDetailOutput {
  id: string;
  /** Formatted appointment code (e.g. "INS-0042"). */
  appointmentCode: string;
  status: string;
  scheduledDate: string;
  /** Bare HH:mm (PWA reconstructs the gating Date from scheduledDate + start). */
  timeSlotStart: string;
  timeSlotEnd: string;
  serviceTypeId: string;
  serviceTypeName: string | null;
  flowType: string;
  propertyId: string;
  propertyAddress: string;
  suburb: string;
  propertyLatitude: number | null;
  propertyLongitude: number | null;
  rentalTenantConfirmationStatus: string;
  rentalTenantConfirmation: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  keyLocation: string | null;
  rentalTenantName: string;
  rentalTenantPhone: string | null;
  rentalTenantEmail: string | null;
  notes: string | null;
  observation: string | null;
  restrictionsSummary: string | null;
  contact: {
    rentalTenantName: string;
    primaryEmail: string | null;
    primaryPhone: string | null;
    secondaryPhone: string | null;
  } | null;
  restrictions: Array<{
    isHome: boolean;
    unavailableDaysJson: unknown;
    unavailableHoursJson: unknown;
    notes: string | null;
  }>;
  execution: {
    id: string;
    startedAt: string;
    finishedAt: string | null;
    resumedAt: string | null;
    startLatitude: number;
    startLongitude: number;
    finishLatitude: number | null;
    finishLongitude: number | null;
    geolocationDistanceMeters: number | null;
    status: 'IN_PROGRESS' | 'FINISHED';
  } | null;
  assets: Array<{
    id: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number | null;
    kind: string;
    status: string;
  }>;
  jobDetails: JobDetails | null;
  /** App credentials linked to this appointment (live reference). */
  apps: AppointmentApp[];
}

export class GetAppointmentDetailUseCase {
  private readonly t1Service = new T1VisibilityService();

  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly assetRepo: IInspectionAssetRepository,
    private readonly serviceTypeReader: IServiceTypeReader,
    private readonly authorizationService: AuthorizationService,
    private readonly tenantRepo: ITenantRepository,
    private readonly appCredentialRepo?: IAppCredentialRepository,
  ) {}

  async execute(input: GetAppointmentDetailInput): Promise<AppointmentDetailOutput> {
    const { appointmentId, actor } = input;

    this.authorizationService.assertRoles(actor, ['INSP'], {
      action: 'inspector.view_own',
      entityType: 'Appointment',
    });

    if (!actor.inspectorId) {
      throw new ForbiddenError('INSPECTOR_NOT_LINKED', 'Inspector profile not linked to user account');
    }

    // Load appointment with cross-tenant access (inspectors are cross-tenant)
    const result = await this.appointmentRepo.findById(appointmentId, null);
    if (!result) {
      throw new ExecutionAppointmentNotFoundError();
    }

    const { appointment, contact, contacts, restrictions } = result;

    // Verify inspector assignment
    if (appointment.inspectorId !== actor.inspectorId) {
      throw new ExecutionAppointmentNotFoundError();
    }

    // Only SCHEDULED or DONE appointments are accessible
    if (appointment.status !== 'SCHEDULED' && appointment.status !== 'DONE') {
      throw new ExecutionAppointmentNotFoundError();
    }

    // Apply T-1 rule for SCHEDULED appointments only
    if (appointment.status === 'SCHEDULED') {
      const st = await this.serviceTypeReader.findById(appointment.serviceTypeId);
      const flowType = st?.flowType ?? 'ROUTINE';
      const today = new Date();
      const isVisible = this.t1Service.isVisibleForInspector(
        flowType,
        appointment.rentalTenantConfirmationStatus,
        appointment.keyRequired,
        appointment.scheduledDate,
        today,
      );
      if (!isVisible) {
        throw new ExecutionT1BlockedError();
      }
    }

    // Load execution and assets
    const execution = await this.executionRepo.findByAppointmentId(appointmentId);
    const assets = execution ? await this.assetRepo.findByExecutionId(execution.id) : [];

    const scheduledDate =
      appointment.scheduledDate instanceof Date
        ? appointment.scheduledDate.toISOString().split('T')[0]!
        : String(appointment.scheduledDate);
    const serviceType = await this.serviceTypeReader.findById(appointment.serviceTypeId);
    const restrictionsSummary = restrictions
      .map((restriction) => restriction.notes?.trim())
      .filter((note): note is string => Boolean(note))
      .join(' | ') || null;

    // Build jobDetails payload
    const jobDetails = await this.buildJobDetails(appointment, contacts);

    // App credentials linked to this appointment (live reference — current values).
    const apps: AppointmentApp[] = this.appCredentialRepo
      ? (await this.appCredentialRepo.findByAppointmentId(appointment.id)).map((a) => ({
          id: a.id,
          name: a.name,
          username: a.username,
          password: a.password,
        }))
      : [];

    const codePrefix = result.tenantAppointmentCodePrefix ?? 'INS';
    const codePadded = String(appointment.appointmentNumber).padStart(4, '0');
    const appointmentCode = `${codePrefix}-${codePadded}`;

    return {
      id: appointment.id,
      appointmentCode,
      status: appointment.status,
      scheduledDate,
      timeSlotStart: appointment.timeSlotStart,
      timeSlotEnd: appointment.timeSlotEnd,
      serviceTypeId: appointment.serviceTypeId,
      serviceTypeName: result.serviceTypeName ?? serviceType?.name ?? null,
      flowType: serviceType?.flowType ?? 'ROUTINE',
      propertyId: appointment.propertyId,
      propertyAddress: result.propertyAddress ?? '',
      suburb: result.propertySuburb ?? '',
      propertyLatitude: result.propertyLatitude ?? null,
      propertyLongitude: result.propertyLongitude ?? null,
      rentalTenantConfirmationStatus: appointment.rentalTenantConfirmationStatus,
      rentalTenantConfirmation: appointment.rentalTenantConfirmationStatus,
      keyRequired: appointment.keyRequired,
      meetingLocation: appointment.meetingLocation,
      keyLocation: appointment.keyLocation,
      rentalTenantName: contact?.rentalTenantName ?? '',
      rentalTenantPhone: contact?.primaryPhone ?? null,
      rentalTenantEmail: contact?.effectiveEmail ?? null,
      notes: appointment.notes,
      observation: appointment.observation,
      restrictionsSummary,
      contact: contact
        ? {
            rentalTenantName: contact.effectiveName,
            primaryEmail: contact.effectiveEmail,
            primaryPhone: contact.effectivePhone,
            secondaryPhone: contact.secondaryPhone,
          }
        : null,
      restrictions: restrictions.map((r) => ({
        isHome: r.isHome,
        unavailableDaysJson: r.unavailableDaysJson,
        unavailableHoursJson: r.unavailableHoursJson,
        notes: r.notes,
      })),
      execution: execution
        ? {
            id: execution.id,
            startedAt: execution.startedAt.toISOString(),
            finishedAt: execution.finishedAt?.toISOString() ?? null,
            resumedAt: execution.resumedAt?.toISOString() ?? null,
            startLatitude: execution.startLatitude,
            startLongitude: execution.startLongitude,
            finishLatitude: execution.finishLatitude,
            finishLongitude: execution.finishLongitude,
            geolocationDistanceMeters: execution.geolocationDistanceMeters,
            status: execution.getStatus() as 'IN_PROGRESS' | 'FINISHED',
          }
        : null,
      assets: assets.map((a) => ({
        id: a.id,
        storageKey: a.storageKey,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        kind: a.kind,
        status: a.status,
      })),
      jobDetails,
      apps,
    };
  }

  private async buildJobDetails(
    appointment: AppointmentWithRelations['appointment'],
    contacts: AppointmentWithRelations['contacts'],
  ): Promise<JobDetails | null> {
    const tenant = await this.tenantRepo.findById(appointment.tenantId);
    if (!tenant) {
      return null;
    }

    // 1. Agency
    const agency: JobDetailsAgency = {
      id: tenant.id,
      name: tenant.name,
    };

    // 2. Tenant contacts — exclude PROPERTY_MANAGER and BROKER roles, primary first
    const tenantContacts: JobDetailsTenantContact[] = contacts
      .filter((c) => c.role !== 'PROPERTY_MANAGER' && c.role !== 'BROKER')
      .map((c) => ({
        name: c.effectiveName,
        email: c.effectiveEmail,
        phone: c.effectivePhone,
        role: c.role,
        isPrimary: c.isPrimary,
      }));

    // 3. Keys
    const keys: JobDetailsKeys = {
      keyRequired: appointment.keyRequired,
      keyLocation: appointment.keyLocation,
    };

    // 4. Key location — only included when keyLocation is non-null
    const keyLocation: JobDetailsKeyLocation | undefined =
      appointment.keyLocation != null
        ? {
            address: appointment.keyLocation,
            mapLinkUrl: `https://maps.google.com/?q=${encodeURIComponent(appointment.keyLocation)}`,
          }
        : undefined;

    // 5. Property manager — find the PM contact, use effective (snapshot-preferred) fields.
    // TODO: Full live-registry JOIN is a future enhancement when the repo returns the contact relation.
    const pmContact = contacts.find((c) => c.role === 'PROPERTY_MANAGER');
    const propertyManager: JobDetailsPropertyManager | null = pmContact
      ? {
          name: pmContact.effectiveName,
          email: pmContact.effectiveEmail,
          phone: pmContact.effectivePhone,
          company: null,
        }
      : null;

    // 6. Payment
    const payment: JobDetailsPayment = {
      payoutAmount: Number(appointment.payoutAmount),
      currency: tenant.currency ?? 'AUD',
    };

    // 7. Inspection app link — read from tenant settings (defensive, no Zod)
    let inspectionAppLink: JobDetailsInspectionAppLink | undefined;
    const settings = tenant.settingsJson;
    if (
      settings &&
      typeof settings === 'object' &&
      'inspectionAppLink' in settings &&
      settings.inspectionAppLink &&
      typeof settings.inspectionAppLink === 'object'
    ) {
      const link = settings.inspectionAppLink as Record<string, unknown>;
      if (typeof link.url === 'string' && typeof link.label === 'string') {
        inspectionAppLink = { url: link.url, label: link.label };
      }
    }

    const result: JobDetails = {
      agency,
      tenantContacts,
      keys,
      propertyManager,
      payment,
    };

    if (keyLocation) {
      result.keyLocation = keyLocation;
    }

    if (inspectionAppLink) {
      result.inspectionAppLink = inspectionAppLink;
    }

    return result;
  }
}
