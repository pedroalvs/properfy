import type { CancelOverdueAppointmentsUseCase, CancelOverdueAppointmentsOutput } from '../../application/use-cases/cancel-overdue-appointments.use-case';

export class CancelOverdueWorker {
  constructor(
    private readonly useCase: CancelOverdueAppointmentsUseCase,
  ) {}

  async execute(): Promise<CancelOverdueAppointmentsOutput> {
    return this.useCase.execute();
  }
}
