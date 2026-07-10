import type { AuthContext } from '@properfy/shared';
import { resolveTenantScope } from '../resolve-tenant-scope';
import type {
  IPropertyRepository,
  PropertyFilters,
  PaginationParams,
} from '../../domain/property.repository';

export interface ListPropertiesInput {
  filters: {
    tenantId?: string;
    branchId?: string;
    type?: string;
    search?: string;
    hasCoordinates?: boolean;
    nearLat?: number;
    nearLng?: number;
    nearRadiusKm?: number;
  };
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListPropertiesOutput {
  data: Array<{
    id: string;
    tenantId: string;
    branchId: string | null;
    branchName: string | null;
    tenantName: string | null;
    propertyCode: string;
    type: string;
    apartmentNumber: string | null;
    street: string;
    addressLine2: string | null;
    suburb: string;
    postcode: string;
    state: string;
    country: string;
    latitude: number | null;
    longitude: number | null;
    geocodingStatus: string;
    privateAreaM2: number | null;
    totalAreaM2: number | null;
    furnished: boolean | null;
    linenProvided: boolean | null;
    rentAmount: number | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export class ListPropertiesUseCase {
  constructor(private readonly propertyRepo: IPropertyRepository) {}

  async execute(input: ListPropertiesInput): Promise<ListPropertiesOutput> {
    const { filters, pagination, actor } = input;

    const tenantId = resolveTenantScope(actor, filters.tenantId);

    const nearLocation =
      filters.nearLat !== undefined && filters.nearLng !== undefined && filters.nearRadiusKm !== undefined
        ? { lat: filters.nearLat, lng: filters.nearLng, radiusKm: filters.nearRadiusKm }
        : undefined;

    const repoFilters: PropertyFilters = {
      tenantId,
      branchId: filters.branchId,
      type: filters.type,
      search: filters.search,
      hasCoordinates: filters.hasCoordinates,
      nearLocation,
    };

    const [data, total] = await Promise.all([
      this.propertyRepo.findAllWithBranch(repoFilters, pagination),
      this.propertyRepo.count(repoFilters),
    ]);

    return {
      data: data.map((item) => ({
        id: item.property.id,
        tenantId: item.property.tenantId,
        branchId: item.property.branchId,
        branchName: item.branchName,
        tenantName: item.tenantName,
        propertyCode: item.property.propertyCode,
        type: item.property.type,
        apartmentNumber: item.property.apartmentNumber,
        street: item.property.street,
        addressLine2: item.property.addressLine2,
        suburb: item.property.suburb,
        postcode: item.property.postcode,
        state: item.property.state,
        country: item.property.country,
        latitude: item.property.lat,
        longitude: item.property.lng,
        geocodingStatus: item.property.geocodingStatus,
        privateAreaM2: item.property.privateAreaM2,
        totalAreaM2: item.property.totalAreaM2,
        furnished: item.property.furnished,
        linenProvided: item.property.linenProvided,
        rentAmount: item.property.rentAmount,
        notes: item.property.notes,
        createdAt: item.property.createdAt,
        updatedAt: item.property.updatedAt,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }
}
