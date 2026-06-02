export interface TemplateImageBindingData {
  id: string;
  templateId: string;
  assetId: string;
  placeholderKey: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
}

export interface UpsertTemplateImageBindingData {
  templateId: string;
  assetId: string;
  placeholderKey: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ITemplateImageBindingRepository {
  findByTemplate(templateId: string): Promise<TemplateImageBindingData[]>;
  findByAsset(assetId: string): Promise<TemplateImageBindingData[]>;
  upsert(data: UpsertTemplateImageBindingData): Promise<TemplateImageBindingData>;
  deleteByTemplateAndKey(templateId: string, placeholderKey: string): Promise<void>;
  deleteAllByTemplate(templateId: string): Promise<void>;
}
