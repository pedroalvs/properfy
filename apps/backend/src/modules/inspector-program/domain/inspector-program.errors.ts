import type { RewardAwardStatus } from '@properfy/shared';
import { ConflictError, NotFoundError, UnprocessableEntityError, ValidationError } from '../../../shared/domain/errors';
import { rewardStatusWord } from './reward-award.entity';

export class GoalNotFoundError extends NotFoundError {
  constructor() {
    super('GOAL_NOT_FOUND', 'Goal not found');
  }
}

export class RewardAwardNotFoundError extends NotFoundError {
  constructor() {
    super('REWARD_AWARD_NOT_FOUND', 'Reward not found');
  }
}

export class RewardAwardInvalidStatusError extends ConflictError {
  constructor(status: RewardAwardStatus) {
    super('REWARD_AWARD_INVALID_STATUS', `This reward is already ${rewardStatusWord(status)}`);
  }
}

export class GoalStartNotAlignedError extends UnprocessableEntityError {
  constructor() {
    super('Start on the first day of a period', undefined, 'GOAL_START_NOT_ALIGNED');
  }
}

export class GoalEndNotAlignedError extends UnprocessableEntityError {
  constructor() {
    super('End on the last day of a period', undefined, 'GOAL_END_NOT_ALIGNED');
  }
}

export class GoalStartInPastError extends UnprocessableEntityError {
  constructor() {
    super('Start on or after the current period', undefined, 'GOAL_START_IN_PAST');
  }
}

export class GoalEndInCurrentPeriodError extends UnprocessableEntityError {
  constructor() {
    super(
      'A goal can only end after the current period. To stop it now, deactivate it.',
      undefined,
      'GOAL_END_IN_CURRENT_PERIOD',
    );
  }
}

export class GoalScopeRegionNotFoundError extends UnprocessableEntityError {
  constructor() {
    super('Choose a region that exists', undefined, 'GOAL_SCOPE_REGION_NOT_FOUND');
  }
}

export class GoalScopeServiceTypeNotFoundError extends UnprocessableEntityError {
  constructor() {
    super('Choose a service type that exists', undefined, 'GOAL_SCOPE_SERVICE_TYPE_NOT_FOUND');
  }
}

export class GoalScopeInspectorNotFoundError extends UnprocessableEntityError {
  constructor() {
    super('Choose an inspector that exists', undefined, 'GOAL_SCOPE_INSPECTOR_NOT_FOUND');
  }
}

export class GoalScopeRegionDeletedError extends UnprocessableEntityError {
  constructor() {
    super("This goal's region was deleted. Create a new goal.", undefined, 'GOAL_SCOPE_REGION_DELETED');
  }
}

// ── Reward action idempotency (approve/void) ──────────────────────────────────
// The reward actions carry an `Idempotency-Key` header so a retry or a concurrent
// duplicate never runs the mutation twice (03.13, Q12 — approve/void only).

export class RewardAwardIdempotencyKeyRequiredError extends ValidationError {
  constructor() {
    super('Idempotency-Key header is required', undefined, 'IDEMPOTENCY_KEY_REQUIRED');
  }
}

export class RewardAwardIdempotencyPayloadMismatchError extends ConflictError {
  constructor() {
    super('IDEMPOTENCY_PAYLOAD_MISMATCH', 'This Idempotency-Key was used with a different request');
  }
}

export class RewardAwardIdempotencyInProgressError extends ConflictError {
  constructor() {
    super('IDEMPOTENCY_IN_PROGRESS', 'An identical request is already being processed');
  }
}
