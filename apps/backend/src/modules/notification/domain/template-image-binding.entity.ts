export interface TemplateImageBindingProps {
  id: string;
  templateId: string;
  assetId: string;
  placeholderKey: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
}

export class TemplateImageBindingEntity {
  readonly id: string;
  readonly templateId: string;
  readonly assetId: string;
  readonly placeholderKey: string;
  readonly altText: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly createdAt: Date;

  constructor(props: TemplateImageBindingProps) {
    this.id = props.id;
    this.templateId = props.templateId;
    this.assetId = props.assetId;
    this.placeholderKey = props.placeholderKey;
    this.altText = props.altText;
    this.width = props.width;
    this.height = props.height;
    this.createdAt = props.createdAt;
  }
}
