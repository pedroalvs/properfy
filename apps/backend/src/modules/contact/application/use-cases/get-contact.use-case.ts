import type {
  IContactRepository,
  ContactPagination,
  ContactAppointmentSummary,
  ContactPropertyAggregate,
} from '../../domain/contact.repository';
import type { ContactEntity } from '../../domain/contact.entity';
import { ContactNotFoundError } from '../../domain/contact.errors';

export interface GetContactSubResourcePagination {
  page: number;
  pageSize: number;
  sortOrder?: 'asc' | 'desc';
}

export interface GetContactOptions {
  includeAppointments?: boolean;
  appointmentsPagination?: GetContactSubResourcePagination;
  includeProperties?: boolean;
  propertiesPagination?: GetContactSubResourcePagination;
}

export interface GetContactPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GetContactResult {
  contact: ContactEntity;
  appointments?: GetContactPaginatedResult<ContactAppointmentSummary>;
  properties?: GetContactPaginatedResult<ContactPropertyAggregate>;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

function resolvePagination(p: GetContactSubResourcePagination | undefined): ContactPagination {
  return {
    page: p?.page ?? DEFAULT_PAGE,
    pageSize: p?.pageSize ?? DEFAULT_PAGE_SIZE,
    sortOrder: p?.sortOrder ?? 'desc',
  };
}

/**
 * Fetches a contact registry row plus optional, separately-paginated
 * sub-resources (appointments + properties). Each sub-resource is gated by an
 * `include*` flag so callers pay only for what they render.
 */
export class GetContactUseCase {
  constructor(private readonly contactRepo: IContactRepository) {}

  async execute(
    contactId: string,
    tenantId: string | null,
    options: GetContactOptions = {},
  ): Promise<GetContactResult> {
    const contact = await this.contactRepo.findById(contactId, tenantId);
    if (!contact) throw new ContactNotFoundError();

    const result: GetContactResult = { contact };

    if (options.includeAppointments) {
      const pagination = resolvePagination(options.appointmentsPagination);
      const [data, total] = await Promise.all([
        this.contactRepo.findAppointmentsByContactId(contactId, pagination),
        this.contactRepo.countAppointmentsByContactId(contactId),
      ]);
      result.appointments = {
        data,
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      };
    }

    if (options.includeProperties) {
      const pagination = resolvePagination(options.propertiesPagination);
      const [data, total] = await Promise.all([
        this.contactRepo.findPropertiesByContactId(contactId, pagination),
        this.contactRepo.countPropertiesByContactId(contactId),
      ]);
      result.properties = {
        data,
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      };
    }

    return result;
  }
}
