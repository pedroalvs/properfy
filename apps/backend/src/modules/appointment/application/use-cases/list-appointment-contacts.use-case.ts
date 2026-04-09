import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
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
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ListAppointmentContactsInput): Promise<ListAppointmentContactsOutput> {
    const { pagination, actor } = input;
    let { filters } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN', 'CL_USER'], { action: 'appointment.list', entityType: 'AppointmentContact' });

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
