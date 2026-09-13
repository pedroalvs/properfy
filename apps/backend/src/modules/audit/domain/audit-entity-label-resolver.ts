/**
 * W1 #409: resolves human-readable labels for the `entityId` an audit entry
 * refers to, so the UI can show a name/code instead of a raw UUID.
 *
 * The port is batch-oriented: one call per entity type per page (never per
 * row), matching the actor/tenant name resolution the list use case already
 * does. Entity types without a resolvable label return an empty map.
 */
export interface IAuditEntityLabelResolver {
  resolveLabels(entityType: string, ids: string[]): Promise<Map<string, string>>;
}
