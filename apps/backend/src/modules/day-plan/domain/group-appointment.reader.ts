/** Resolves a service group to its live appointment ids, for the STALE subscriber. */
export interface IGroupAppointmentReader {
  loadIdsByGroup(groupId: string): Promise<string[]>;
}
