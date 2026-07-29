import type { CancelEmptyServiceGroupsUseCase, CancelEmptyServiceGroupsOutput } from '../../application/use-cases/cancel-empty-service-groups.use-case';

export class CancelEmptyGroupsWorker {
  constructor(
    private readonly useCase: CancelEmptyServiceGroupsUseCase,
  ) {}

  async execute(): Promise<CancelEmptyServiceGroupsOutput> {
    return this.useCase.execute();
  }
}
