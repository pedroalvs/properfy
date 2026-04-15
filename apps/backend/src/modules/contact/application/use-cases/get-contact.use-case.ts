import type { IContactRepository, ContactPagination, ContactAppointmentSummary } from '../../domain/contact.repository';
import type { ContactEntity } from '../../domain/contact.entity';
import { ContactNotFoundError } from '../../domain/contact.errors';

export interface GetContactResult {
  contact: ContactEntity;
  appointments?: {
    data: ContactAppointmentSummary[];
    total: number;
  };
}

export class GetContactUseCase {
  constructor(private readonly contactRepo: IContactRepository) {}

  async execute(
    contactId: string,
    tenantId: string | null,
    includeAppointments?: boolean,
  ): Promise<GetContactResult> {
    const contact = await this.contactRepo.findById(contactId, tenantId);
    if (!contact) throw new ContactNotFoundError();

    const result: GetContactResult = { contact };

    if (includeAppointments) {
      const pagination: ContactPagination = { page: 1, pageSize: 20, sortOrder: 'desc' };
      const [data, total] = await Promise.all([
        this.contactRepo.findAppointmentsByContactId(contactId, pagination),
        this.contactRepo.countAppointmentsByContactId(contactId),
      ]);
      result.appointments = { data, total };
    }

    return result;
  }
}
