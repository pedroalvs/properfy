export interface OpenAppointmentCounts {
  total: number;
  byStatus: Record<string, number>;
}

export interface IInspectorAppointmentChecker {
  countOpenAppointmentsForInspector(inspectorId: string): Promise<OpenAppointmentCounts>;
}
