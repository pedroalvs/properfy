import type { CycleStatus, CycleConfirmationSource, CycleInvalidatedReason } from '@properfy/shared';

export interface ConfirmationCycleProps {
  id: string;
  appointmentId: string;
  cycleNumber: number;
  scheduledDate: Date;
  timeSlot: string | null;
  status: CycleStatus;
  confirmationSource: CycleConfirmationSource | null;
  confirmedAt: Date | null;
  invalidatedAt: Date | null;
  invalidatedReason: CycleInvalidatedReason | null;
  portalTokenId: string | null;
  createdAt: Date;
}

export class ConfirmationCycleEntity {
  readonly id: string;
  readonly appointmentId: string;
  readonly cycleNumber: number;
  readonly scheduledDate: Date;
  readonly timeSlot: string | null;
  readonly status: CycleStatus;
  readonly confirmationSource: CycleConfirmationSource | null;
  readonly confirmedAt: Date | null;
  readonly invalidatedAt: Date | null;
  readonly invalidatedReason: CycleInvalidatedReason | null;
  readonly portalTokenId: string | null;
  readonly createdAt: Date;

  constructor(props: ConfirmationCycleProps) {
    this.id = props.id;
    this.appointmentId = props.appointmentId;
    this.cycleNumber = props.cycleNumber;
    this.scheduledDate = props.scheduledDate;
    this.timeSlot = props.timeSlot;
    this.status = props.status;
    this.confirmationSource = props.confirmationSource;
    this.confirmedAt = props.confirmedAt;
    this.invalidatedAt = props.invalidatedAt;
    this.invalidatedReason = props.invalidatedReason;
    this.portalTokenId = props.portalTokenId;
    this.createdAt = props.createdAt;
  }

  /** Returns a new instance with status CONFIRMED. */
  markConfirmed(source: CycleConfirmationSource, tokenId: string | null): ConfirmationCycleEntity {
    return new ConfirmationCycleEntity({
      ...this.toProps(),
      status: 'CONFIRMED',
      confirmationSource: source,
      confirmedAt: new Date(),
      portalTokenId: tokenId ?? this.portalTokenId,
    });
  }

  /** Returns a new instance with status UNAVAILABLE. */
  markUnavailable(): ConfirmationCycleEntity {
    return new ConfirmationCycleEntity({
      ...this.toProps(),
      status: 'UNAVAILABLE',
    });
  }

  /** Returns a new instance with status SUPERSEDED. */
  markSuperseded(reason: CycleInvalidatedReason): ConfirmationCycleEntity {
    return new ConfirmationCycleEntity({
      ...this.toProps(),
      status: 'SUPERSEDED',
      invalidatedAt: new Date(),
      invalidatedReason: reason,
    });
  }

  isTerminal(): boolean {
    return this.status === 'SUPERSEDED';
  }

  private toProps(): ConfirmationCycleProps {
    return {
      id: this.id,
      appointmentId: this.appointmentId,
      cycleNumber: this.cycleNumber,
      scheduledDate: this.scheduledDate,
      timeSlot: this.timeSlot,
      status: this.status,
      confirmationSource: this.confirmationSource,
      confirmedAt: this.confirmedAt,
      invalidatedAt: this.invalidatedAt,
      invalidatedReason: this.invalidatedReason,
      portalTokenId: this.portalTokenId,
      createdAt: this.createdAt,
    };
  }
}
