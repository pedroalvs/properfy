import type { Prisma, PrismaClient } from '@prisma/client';
import type { Aes256GcmService } from '../../../shared/infrastructure/crypto/aes-256-gcm.service';
import { AppCredentialEntity } from '../domain/app-credential.entity';
import type {
  IAppCredentialRepository,
  AppCredentialFilters,
  AppCredentialPagination,
  AppCredentialListRow,
  AppCredentialUpdateData,
} from '../domain/app-credential.repository';

interface AppCredentialRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  username: string;
  password_encrypted: string;
  needs_auth_code: boolean;
  auth_code_encrypted: string | null;
  app_url: string | null;
  instructions_url: string | null;
  instructions_password_encrypted: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const SORTABLE: Record<string, string> = {
  name: 'name',
  username: 'username',
  createdAt: 'created_at',
};

export class PrismaAppCredentialRepository implements IAppCredentialRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly aes: Aes256GcmService,
  ) {}

  private mapToEntity(row: AppCredentialRow): AppCredentialEntity {
    return new AppCredentialEntity({
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      name: row.name,
      username: row.username,
      password: this.aes.decrypt(row.password_encrypted),
      needsAuthCode: row.needs_auth_code,
      authCode: row.auth_code_encrypted ? this.aes.decrypt(row.auth_code_encrypted) : null,
      appUrl: row.app_url,
      instructionsUrl: row.instructions_url,
      instructionsPassword: row.instructions_password_encrypted
        ? this.aes.decrypt(row.instructions_password_encrypted)
        : null,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  private buildWhere(filters: AppCredentialFilters): Prisma.AppCredentialWhereInput {
    const where: Prisma.AppCredentialWhereInput = {};
    if (filters.tenantId) where.tenant_id = filters.tenantId;
    if (filters.isActive !== undefined) where.is_active = filters.isActive;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { username: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    // Branch filter = branch-scoped OR agency-wide. Nested under AND so it
    // does not collide with the search OR above.
    if (filters.branchId) {
      where.AND = [{ OR: [{ branch_id: filters.branchId }, { branch_id: null }] }];
    }
    return where;
  }

  async findById(id: string): Promise<AppCredentialEntity | null> {
    const row = await this.prisma.appCredential.findUnique({ where: { id } });
    return row ? this.mapToEntity(row) : null;
  }

  async findAll(
    filters: AppCredentialFilters,
    pagination: AppCredentialPagination,
  ): Promise<AppCredentialListRow[]> {
    const sortColumn = SORTABLE[pagination.sortBy ?? 'name'] ?? 'name';
    const rows = await this.prisma.appCredential.findMany({
      where: this.buildWhere(filters),
      orderBy: { [sortColumn]: pagination.sortOrder },
      skip: (pagination.page - 1) * pagination.pageSize,
      take: pagination.pageSize,
      include: {
        tenant: { select: { name: true } },
        branch: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      credential: this.mapToEntity(row),
      tenantName: row.tenant?.name ?? null,
      branchName: row.branch?.name ?? null,
    }));
  }

  async count(filters: AppCredentialFilters): Promise<number> {
    return this.prisma.appCredential.count({ where: this.buildWhere(filters) });
  }

  async search(tenantId: string, query: string): Promise<AppCredentialEntity[]> {
    const rows = await this.prisma.appCredential.findMany({
      where: {
        tenant_id: tenantId,
        is_active: true,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { username: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 20,
    });
    return rows.map((row) => this.mapToEntity(row));
  }

  async save(credential: AppCredentialEntity): Promise<void> {
    await this.prisma.appCredential.create({
      data: {
        id: credential.id,
        tenant_id: credential.tenantId,
        branch_id: credential.branchId,
        name: credential.name,
        username: credential.username,
        password_encrypted: this.aes.encrypt(credential.password),
        needs_auth_code: credential.needsAuthCode,
        auth_code_encrypted: credential.authCode ? this.aes.encrypt(credential.authCode) : null,
        app_url: credential.appUrl,
        instructions_url: credential.instructionsUrl,
        instructions_password_encrypted: credential.instructionsPassword
          ? this.aes.encrypt(credential.instructionsPassword)
          : null,
        is_active: credential.isActive,
        created_at: credential.createdAt,
        updated_at: credential.updatedAt,
      },
    });
  }

  async update(id: string, data: AppCredentialUpdateData): Promise<void> {
    const updateData: Prisma.AppCredentialUncheckedUpdateInput = {};
    if (data.branchId !== undefined) updateData.branch_id = data.branchId;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.username !== undefined) updateData.username = data.username;
    if (data.password !== undefined) updateData.password_encrypted = this.aes.encrypt(data.password);
    if (data.needsAuthCode !== undefined) updateData.needs_auth_code = data.needsAuthCode;
    if (data.authCode !== undefined) {
      updateData.auth_code_encrypted = data.authCode ? this.aes.encrypt(data.authCode) : null;
    }
    if (data.appUrl !== undefined) updateData.app_url = data.appUrl;
    if (data.instructionsUrl !== undefined) updateData.instructions_url = data.instructionsUrl;
    if (data.instructionsPassword !== undefined) {
      updateData.instructions_password_encrypted = data.instructionsPassword
        ? this.aes.encrypt(data.instructionsPassword)
        : null;
    }
    if (data.isActive !== undefined) updateData.is_active = data.isActive;
    await this.prisma.appCredential.update({ where: { id }, data: updateData });
  }

  async findByIds(ids: string[]): Promise<AppCredentialEntity[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.appCredential.findMany({ where: { id: { in: ids } } });
    return rows.map((row) => this.mapToEntity(row));
  }

  async findByAppointmentId(appointmentId: string): Promise<AppCredentialEntity[]> {
    const links = await this.prisma.appointmentAppCredential.findMany({
      where: { appointment_id: appointmentId },
      orderBy: { created_at: 'asc' },
      include: { app_credential: true },
    });
    return links.map((link) => this.mapToEntity(link.app_credential));
  }

  async replaceAppointmentLinks(appointmentId: string, appCredentialIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(appCredentialIds)];
    await this.prisma.$transaction([
      this.prisma.appointmentAppCredential.deleteMany({ where: { appointment_id: appointmentId } }),
      ...(uniqueIds.length > 0
        ? [
            this.prisma.appointmentAppCredential.createMany({
              data: uniqueIds.map((appCredentialId) => ({
                id: crypto.randomUUID(),
                appointment_id: appointmentId,
                app_credential_id: appCredentialId,
              })),
            }),
          ]
        : []),
    ]);
  }
}
