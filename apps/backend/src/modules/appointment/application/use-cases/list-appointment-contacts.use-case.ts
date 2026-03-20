import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type {
  IAppointmentRepository,
  ContactFilters,
  PaginationParams,
  ContactListItem,
} from '../../domain/appointment.repository';

export interface ListAppointmentContactsInput {
  filters: ContactFilters;
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ListAppointmentContactsOutput {
  data: ContactListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export class ListAppointmentContactsUseCase {
  constructor(private readonly appointmentRepo: IAppointmentRepository) {}

  async execute(input: ListAppointmentContactsInput): Promise<ListAppointmentContactsOutput> {
    const { pagination, actor } = input;
    let { filters } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP' && actor.role !== 'CL_ADMIN' && actor.role !== 'CL_USER') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // CL_ADMIN/CL_USER are scoped to their tenant
    if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      if (!actor.tenantId) {
        throw new ForbiddenError('AUTH_FORBIDDEN', 'Tenant context required');
      }
      filters = { ...filters, tenantId: actor.tenantId };
    }

    const [data, total] = await Promise.all([
      this.appointmentRepo.findAllContacts(filters, pagination),
      this.appointmentRepo.countContacts(filters),
    ]);

    return { data, total, page: pagination.page, pageSize: pagination.pageSize };
  }
}
