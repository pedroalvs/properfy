import type { PrismaClient } from '@prisma/client';
import type { InspectorStatus as PrismaInspectorStatus, Prisma } from '@prisma/client';
import { InspectorEntity } from '../domain/inspector.entity';
import type {
  IInspectorRepository,
  InspectorFilters,
  PaginationParams,
} from '../domain/inspector.repository';
import type {
  InspectorStatus,
  PaymentSettings,
  ServiceTypeEntry,
  AvailabilityTemplate,
  BillingPeriodType,
} from '@properfy/shared';
import { availabilityTemplateSchema } from '@properfy/shared';

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function mapToEntity(row: {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  payment_settings_json: unknown;
  service_types_json: unknown;
  blocked_clients_json: unknown;
  full_name: string | null;
  address: unknown;
  abn: string | null;
  date_of_birth: Date | null;
  insurance_file_key: string | null;
  insurance_expires_at: Date | null;
  insurance_meta_json: unknown;
  police_check_file_key: string | null;
  police_check_expires_at: Date | null;
  police_check_meta_json: unknown;
  photo_storage_key: string | null;
  availability_template_json: unknown;
  billing_cycle: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}): InspectorEntity {
  return new InspectorEntity({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status as InspectorStatus,
    paymentSettingsJson:
      (row.payment_settings_json as PaymentSettings) ?? {},
    serviceTypesJson: (row.service_types_json as ServiceTypeEntry[]) ?? [],
    blockedClientsJson: Array.isArray(row.blocked_clients_json) ? (row.blocked_clients_json as string[]) : [],
    fullName: row.full_name ?? null,
    address: row.address as Record<string, unknown> | null,
    abn: row.abn ?? null,
    dateOfBirth: row.date_of_birth ?? null,
    insuranceFileKey: row.insurance_file_key ?? null,
    insuranceExpiresAt: row.insurance_expires_at ?? null,
    insuranceMetaJson: row.insurance_meta_json as Record<string, unknown> | null ?? null,
    policeCheckFileKey: row.police_check_file_key ?? null,
    policeCheckExpiresAt: row.police_check_expires_at ?? null,
    policeCheckMetaJson: row.police_check_meta_json as Record<string, unknown> | null ?? null,
    photoStorageKey: row.photo_storage_key ?? null,
    availabilityTemplateJson: (row.availability_template_json as Record<string, unknown>) ?? {},
    billingCycle: (row.billing_cycle as BillingPeriodType | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PrismaInspectorRepository implements IInspectorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<InspectorEntity | null> {
    const row = await this.prisma.inspector.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByEmail(email: string): Promise<InspectorEntity | null> {
    const row = await this.prisma.inspector.findFirst({
      where: { email, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async findByUserId(userId: string): Promise<InspectorEntity | null> {
    const row = await this.prisma.inspector.findFirst({
      where: { user_id: userId, deleted_at: null },
    });
    return row ? mapToEntity(row) : null;
  }

  async linkUserId(inspectorId: string, userId: string): Promise<void> {
    await this.prisma.inspector.update({
      where: { id: inspectorId },
      data: { user_id: userId },
    });
  }

  async findAll(
    filters: InspectorFilters,
    pagination: PaginationParams,
  ): Promise<InspectorEntity[]> {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.inspector.findMany({
      where,
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      orderBy: {
        [toSnakeCase(pagination.sortBy ?? 'created_at')]: pagination.sortOrder,
      },
    });

    // Post-filter by tenantId eligibility if needed
    if (filters.tenantId) {
      return rows
        .map(mapToEntity)
        .filter((i) => i.isEligibleForTenant(filters.tenantId!));
    }

    return rows.map(mapToEntity);
  }

  async count(filters: InspectorFilters): Promise<number> {
    if (filters.tenantId) {
      // For tenant filtering, we need to post-filter, so count all matching first
      const where = this.buildWhere(filters);
      const rows = await this.prisma.inspector.findMany({
        where,
        select: { blocked_clients_json: true },
      });
      return rows.filter((r) => {
        // Blocked-clients deny-list: an inspector is eligible unless the
        // tenant is in its block list.
        const blocked = Array.isArray(r.blocked_clients_json) ? (r.blocked_clients_json as string[]) : [];
        return !blocked.includes(filters.tenantId!);
      }).length;
    }
    const where = this.buildWhere(filters);
    return this.prisma.inspector.count({ where });
  }

  async save(inspector: InspectorEntity): Promise<void> {
    await this.prisma.inspector.create({
      data: {
        id: inspector.id,
        name: inspector.name,
        email: inspector.email,
        phone: inspector.phone,
        status: inspector.status as PrismaInspectorStatus,
        payment_settings_json: inspector.paymentSettingsJson as Prisma.InputJsonValue,
        service_types_json: inspector.serviceTypesJson,
        blocked_clients_json: inspector.blockedClientsJson,
        full_name: inspector.fullName,
        address: inspector.address as Prisma.InputJsonValue,
        abn: inspector.abn,
        date_of_birth: inspector.dateOfBirth,
        insurance_file_key: inspector.insuranceFileKey,
        insurance_expires_at: inspector.insuranceExpiresAt,
        police_check_file_key: inspector.policeCheckFileKey,
        police_check_expires_at: inspector.policeCheckExpiresAt,
      },
    });
  }

  // Inspectors are global entities (not tenant-scoped); scoped by unique id only
  async update(
    id: string,
    data: Partial<{
      name: string;
      email: string;
      phone: string | null;
      status: string;
      paymentSettingsJson: PaymentSettings;
      serviceTypesJson: ServiceTypeEntry[];
      blockedClientsJson: string[];
      fullName: string | null;
      address: Record<string, unknown> | null;
      abn: string | null;
      dateOfBirth: Date | null;
      insuranceFileKey: string | null;
      insuranceExpiresAt: Date | null;
      policeCheckFileKey: string | null;
      policeCheckExpiresAt: Date | null;
      deletedAt: Date | null;
      photoStorageKey: string | null;
      insuranceMetaJson: Record<string, unknown> | null;
      policeCheckMetaJson: Record<string, unknown> | null;
    }>,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.email !== undefined) updateData['email'] = data.email;
    if (data.phone !== undefined) updateData['phone'] = data.phone;
    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.paymentSettingsJson !== undefined)
      updateData['payment_settings_json'] = data.paymentSettingsJson;
    if (data.serviceTypesJson !== undefined)
      updateData['service_types_json'] = data.serviceTypesJson;
    if (data.blockedClientsJson !== undefined)
      updateData['blocked_clients_json'] = data.blockedClientsJson;
    if (data.fullName !== undefined)
      updateData['full_name'] = data.fullName;
    if (data.address !== undefined)
      updateData['address'] = data.address;
    if (data.abn !== undefined)
      updateData['abn'] = data.abn;
    if (data.dateOfBirth !== undefined)
      updateData['date_of_birth'] = data.dateOfBirth;
    if (data.insuranceFileKey !== undefined)
      updateData['insurance_file_key'] = data.insuranceFileKey;
    if (data.insuranceExpiresAt !== undefined)
      updateData['insurance_expires_at'] = data.insuranceExpiresAt;
    if (data.policeCheckFileKey !== undefined)
      updateData['police_check_file_key'] = data.policeCheckFileKey;
    if (data.policeCheckExpiresAt !== undefined)
      updateData['police_check_expires_at'] = data.policeCheckExpiresAt;
    if (data.deletedAt !== undefined)
      updateData['deleted_at'] = data.deletedAt;
    if (data.photoStorageKey !== undefined)
      updateData['photo_storage_key'] = data.photoStorageKey;
    if (data.insuranceMetaJson !== undefined)
      updateData['insurance_meta_json'] = data.insuranceMetaJson;
    if (data.policeCheckMetaJson !== undefined)
      updateData['police_check_meta_json'] = data.policeCheckMetaJson;
    await this.prisma.inspector.update({ where: { id }, data: updateData });
  }

  async findByRegionId(regionId: string): Promise<InspectorEntity[]> {
    const rows = await this.prisma.inspector.findMany({
      where: {
        deleted_at: null,
        inspector_regions: { some: { region_id: regionId } },
      },
    });
    return rows.map(mapToEntity);
  }

  async getAvailabilityTemplate(inspectorId: string): Promise<AvailabilityTemplate> {
    const row = await this.prisma.inspector.findFirst({
      where: { id: inspectorId },
      select: { availability_template_json: true },
    });
    const parsed = availabilityTemplateSchema.safeParse(row?.availability_template_json);
    if (parsed.success) return parsed.data;
    const off = { am: false, pm: false };
    return { mon: off, tue: off, wed: off, thu: off, fri: off, sat: off, sun: off };
  }

  async updateAvailabilityTemplate(inspectorId: string, template: AvailabilityTemplate): Promise<void> {
    await this.prisma.inspector.update({
      where: { id: inspectorId },
      data: { availability_template_json: template as any },
    });
  }

  private buildWhere(filters: InspectorFilters) {
    const where: Record<string, unknown> = { deleted_at: null };
    if (filters.status) where['status'] = filters.status;
    if (filters.search) {
      where['OR'] = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.region) {
      where['inspector_regions'] = { some: { region_id: filters.region } };
    }
    if (filters.serviceTypeId) {
      where['service_types_json'] = { array_contains: [filters.serviceTypeId] };
    }
    return where;
  }
}
