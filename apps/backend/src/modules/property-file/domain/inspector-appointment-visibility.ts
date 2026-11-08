/**
 * Resolves whether an inspector may see a given appointment's files/issues,
 * reusing the SAME assignment + T-1 visibility rule as the inspector's
 * appointment detail (D28) — never a loose `inspector_id = me`.
 */
export interface InspectorVisibleAppointment {
  propertyId: string;
  tenantId: string;
}

export interface IInspectorAppointmentVisibility {
  /**
   * The property/tenant of the appointment when it is assigned to this inspector
   * and visible under the T-1 rule; `null` when it is not (treated as 404 by
   * callers so existence is not revealed).
   */
  resolveForInspector(
    appointmentId: string,
    inspectorId: string,
  ): Promise<InspectorVisibleAppointment | null>;
}
