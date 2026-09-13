import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { formatInstantDateTime } from '@/lib/format-date';
import { formatAuditAction, formatAuditActor, formatAuditTenant, summarizeAuditChanges } from '../lib/audit-log-display';
import type { AuditLog } from '../types';

interface AuditLogDetailDrawerProps {
  log: AuditLog | null;
  open: boolean;
  onClose: () => void;
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  if (data === null || data === undefined) return null;
  return (
    <div className="mb-4">
      <p className="mb-1 text-xs font-semibold text-text-muted">{label}</p>
      <pre className="overflow-auto rounded border border-black/10 bg-app-bg p-3 text-xs font-mono text-text-secondary">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export function AuditLogDetailDrawer({ log, open, onClose }: AuditLogDetailDrawerProps) {
  return (
    <DrawerPanel open={open} onClose={onClose} size="narrow">
      <div className="flex h-full flex-col">
        <DrawerHeader title="Audit Log Detail" onClose={onClose} />

        {log ? (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-3">
              {/* W8 #417: single column on narrow viewports, two on >= sm. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-text-muted">Timestamp</p>
                  <p className="text-sm font-medium">{formatInstantDateTime(log.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Actor</p>
                  {/* W2 #423: pass the resolved names so the drawer matches the list. */}
                  <p className="text-sm font-medium">
                    {formatAuditActor(log.actorType, log.actorId, log.actorName)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Agency</p>
                  <p className="text-sm font-medium">{formatAuditTenant(log.tenantId, log.tenantName)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Entity Type</p>
                  <p className="text-sm font-medium">{log.entityType}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Entity</p>
                  {/* W1 #409: readable label, never the raw UUID. */}
                  <p className="text-sm font-medium">{log.entityName ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Action</p>
                  <p className="text-sm font-medium">{formatAuditAction(log.action)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">IP Address</p>
                  <p className="text-sm font-medium">{log.ipAddress ?? '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-text-muted">Changed Fields</p>
                  <p className="text-sm font-medium">{summarizeAuditChanges(log)}</p>
                </div>
              </div>

              {log.reason && (
                <div>
                  <p className="text-xs text-text-muted">Reason</p>
                  <p className="text-sm font-medium">{log.reason}</p>
                </div>
              )}

              {log.requestId && (
                <div>
                  <p className="text-xs text-text-muted">Request ID</p>
                  <p className="text-sm font-mono text-xs">{log.requestId}</p>
                </div>
              )}

              <JsonBlock label="Before" data={log.beforeJson} />
              <JsonBlock label="After" data={log.afterJson} />
              <JsonBlock label="Metadata" data={log.metadataJson} />
            </div>
          </div>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
