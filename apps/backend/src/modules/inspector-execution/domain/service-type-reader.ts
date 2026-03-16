export interface ServiceTypeInfo {
  id: string;
  code: string;
  name: string;
  flowType: string;
}

export interface IServiceTypeReader {
  findById(id: string): Promise<ServiceTypeInfo | null>;
  findByIds(ids: string[]): Promise<ServiceTypeInfo[]>;
}
