import type { PrismaClient } from '@prisma/client';
import type {
  IInspectorDirectoryRepository,
  NoticeRegion,
} from '../domain/inspector-directory.repository';

/** Prisma reads over the platform-scoped inspectors/regions for audience resolution. */
export class PrismaInspectorDirectoryRepository implements IInspectorDirectoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllActiveInspectorIds(): Promise<string[]> {
    const rows = await this.prisma.inspector.findMany({
      where: { status: 'ACTIVE', deleted_at: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async findActiveInspectorIdsByIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.inspector.findMany({
      where: { id: { in: ids }, status: 'ACTIVE', deleted_at: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async findActiveInspectorIdsByRegion(regionId: string): Promise<string[]> {
    const rows = await this.prisma.inspector.findMany({
      where: {
        status: 'ACTIVE',
        deleted_at: null,
        inspector_regions: { some: { region_id: regionId } },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async findRegion(regionId: string): Promise<NoticeRegion | null> {
    const region = await this.prisma.serviceRegion.findUnique({
      where: { id: regionId },
      select: { id: true, name: true, status: true },
    });
    return region ? { id: region.id, name: region.name, status: region.status } : null;
  }

  async findUserName(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name ?? null;
  }
}
