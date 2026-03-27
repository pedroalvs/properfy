import { NotFoundError, ConflictError } from '../../../shared/domain/errors';

export class AppointmentTimeSlotNotFoundError extends NotFoundError {
  constructor() {
    super('TIME_SLOT_NOT_FOUND', 'Time slot not found');
  }
}

export class AppointmentTimeSlotConflictError extends ConflictError {
  constructor() {
    super('TIME_SLOT_CONFLICT', 'A time slot with the same start and end time already exists for this scope');
  }
}
