import { NotFoundError } from '../../../shared/domain/errors';

/** The requested inspector does not exist (or is soft-deleted). */
export class InspectorNotFoundError extends NotFoundError {
  constructor() {
    super('INSPECTOR_NOT_FOUND', 'Inspector not found');
  }
}
