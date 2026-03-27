export interface AppointmentTimeSlotProps {
  id: string;
  tenantId: string;
  branchId: string | null;
  label: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class AppointmentTimeSlotEntity {
  constructor(private readonly props: AppointmentTimeSlotProps) {}

  get id() { return this.props.id; }
  get tenantId() { return this.props.tenantId; }
  get branchId() { return this.props.branchId; }
  get label() { return this.props.label; }
  get startTime() { return this.props.startTime; }
  get endTime() { return this.props.endTime; }
  get sortOrder() { return this.props.sortOrder; }
  get isActive() { return this.props.isActive; }
  get createdAt() { return this.props.createdAt; }
  get updatedAt() { return this.props.updatedAt; }
  get deletedAt() { return this.props.deletedAt; }

  /** Composite value stored in appointment.time_slot */
  get compositeValue(): string {
    return `${this.startTime}-${this.endTime}`;
  }

  isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
