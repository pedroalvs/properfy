import type { RejectUnconfirmedAppointmentsUseCase, RejectUnconfirmedAppointmentsOutput } from '../../application/use-cases/reject-unconfirmed-appointments.use-case';

export class RejectUnconfirmedWorker {
  constructor(
    private readonly useCase: RejectUnconfirmedAppointmentsUseCase,
  ) {}

  async execute(): Promise<RejectUnconfirmedAppointmentsOutput> {
    return this.useCase.execute();
  }
}
