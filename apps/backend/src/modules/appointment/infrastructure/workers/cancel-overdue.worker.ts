import type { CancelOverdueAppointmentsUseCase, CancelOverdueAppointmentsOutput } from '../../application/use-cases/cancel-overdue-appointments.use-case';

export class CancelOverdueWorker {
  constructor(
    private readonly useCase: CancelOverdueAppointmentsUseCase,
  ) {}

  async execute(scope?: { tenantIds: string[] }): Promise<CancelOverdueAppointmentsOutput> {
    return this.useCase.execute(scope);
  }
}
