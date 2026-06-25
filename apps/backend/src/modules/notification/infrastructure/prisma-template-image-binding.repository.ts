import type { PrismaClient } from '@prisma/client';
import type {
  ITemplateImageBindingRepository,
  TemplateImageBindingData,
  UpsertTemplateImageBindingData,
} from '../domain/template-image-binding.repository';

function toData(row: {
  id: string; template_id: string; asset_id: string; placeholder_key: string;
  alt_text: string | null; width: number | null; height: number | null; created_at: Date;
}): TemplateImageBindingData {
  return {
    id: row.id,
    templateId: row.template_id,
    assetId: row.asset_id,
    placeholderKey: row.placeholder_key,
    altText: row.alt_text,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

export class PrismaTemplateImageBindingRepository implements ITemplateImageBindingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTemplate(templateId: string): Promise<TemplateImageBindingData[]> {
    const rows = await this.prisma.templateImageBinding.findMany({ where: { template_id: templateId } });
    return rows.map((r) => toData(r as Parameters<typeof toData>[0]));
  }

  async findByAsset(assetId: string): Promise<TemplateImageBindingData[]> {
    const rows = await this.prisma.templateImageBinding.findMany({ where: { asset_id: assetId } });
    return rows.map((r) => toData(r as Parameters<typeof toData>[0]));
  }

  async upsert(data: UpsertTemplateImageBindingData): Promise<TemplateImageBindingData> {
    const row = await this.prisma.templateImageBinding.upsert({
      where: { template_id_placeholder_key: { template_id: data.templateId, placeholder_key: data.placeholderKey } },
      create: {
        id: crypto.randomUUID(),
        template_id: data.templateId,
        asset_id: data.assetId,
        placeholder_key: data.placeholderKey,
        alt_text: data.altText ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
      },
      update: {
        asset_id: data.assetId,
        alt_text: data.altText ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
      },
    });
    return toData(row as Parameters<typeof toData>[0]);
  }

  async deleteByTemplateAndKey(templateId: string, placeholderKey: string): Promise<void> {
    await this.prisma.templateImageBinding.deleteMany({
      where: { template_id: templateId, placeholder_key: placeholderKey },
    });
  }

  async deleteAllByTemplate(templateId: string): Promise<void> {
    await this.prisma.templateImageBinding.deleteMany({ where: { template_id: templateId } });
  }
}
