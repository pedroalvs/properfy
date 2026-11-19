import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { PropertyFileType, PropertyFileResponse } from '@properfy/shared';
import { DEFAULT_PROPERTY_FILES_SETTING } from '@properfy/shared';
import { FilterInput } from '@/components/filters/FilterInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ConfirmDialog } from '@/components/ui';
import { useDownloadPropertyFile } from '../hooks/useDownloadPropertyFile';
import { useAddFileVersion } from '../hooks/useAddFileVersion';
import { useDeletePropertyFile } from '../hooks/useDeletePropertyFile';
import { groupLatestVersions, versionsForGroup, hasMultipleVersions } from '../lib/file-versions';
import { PropertyFileCard } from './PropertyFileCard';
import { FileVersionsDrawer } from './FileVersionsDrawer';
import { UploadFileControl } from './UploadFileControl';

export interface AppointmentRefs {
  /** appointmentId → human code (for "Appointment #{code}"). */
  codeMap: Record<string, string>;
  /** Options for the optional "link to appointment" selector (property context). */
  options: { id: string; code: string }[];
}

export interface FileSubtabListProps {
  /** All versions of this subtab's type. */
  files: PropertyFileResponse[];
  type: PropertyFileType;
  propertyId: string;
  /** Appointment context: files uploaded here are linked to this appointment. */
  appointmentId?: string;
  canUpload: boolean;
  canVersion: boolean;
  canDelete: boolean;
  /** Property context: appointment code map + link-selector options. */
  appointmentRefs?: AppointmentRefs;
  onOpenAppointment?: (appointmentId: string) => void;
}

const DOC_ACCEPT = DEFAULT_PROPERTY_FILES_SETTING.allowedMimes.join(',');

export function FileSubtabList({
  files,
  type,
  propertyId,
  appointmentId,
  canUpload,
  canVersion,
  canDelete,
  appointmentRefs,
  onOpenAppointment,
}: FileSubtabListProps) {
  const [search, setSearch] = useState('');
  const [linkAppointmentId, setLinkAppointmentId] = useState('');
  const [versionsGroupId, setVersionsGroupId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PropertyFileResponse | null>(null);
  const newVersionSourceRef = useRef<string | null>(null);
  const versionInputRef = useRef<HTMLInputElement>(null);

  const { download, downloadingId } = useDownloadPropertyFile();
  const { addVersion } = useAddFileVersion();
  const { remove, deletingId } = useDeletePropertyFile();

  const latest = useMemo(() => groupLatestVersions(files), [files]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? latest.filter((f) => f.fileName.toLowerCase().includes(term)) : latest;
  }, [latest, search]);

  const versionsForDrawer = useMemo(
    () => (versionsGroupId ? versionsForGroup(files, versionsGroupId) : []),
    [files, versionsGroupId],
  );
  const versionsFileName = versionsForDrawer[0]?.fileName ?? '';

  // In property context, an upload may optionally link to one of the property's appointments.
  const uploadAppointmentId = appointmentId ?? (linkAppointmentId || undefined);

  const handleNewVersion = (sourceFileId: string) => {
    newVersionSourceRef.current = sourceFileId;
    versionInputRef.current?.click();
  };
  const handleVersionFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const sourceId = newVersionSourceRef.current;
    e.target.value = '';
    newVersionSourceRef.current = null;
    if (!file || !sourceId) return;
    await addVersion(sourceId, file);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="sm:max-w-xs sm:flex-1">
          <FilterInput label="Search files" placeholder="Search by name" value={search} onChange={setSearch} />
        </div>
        {canUpload && (
          <div className="flex items-end gap-2">
            {appointmentRefs && appointmentRefs.options.length > 0 && (
              <div className="min-w-[12rem]">
                <span className="mb-1.5 block text-xs font-semibold text-text-secondary">
                  Link to appointment (optional)
                </span>
                <SelectInput
                  value={linkAppointmentId}
                  onChange={setLinkAppointmentId}
                  options={[
                    { label: 'No appointment', value: '' },
                    ...appointmentRefs.options.map((o) => ({ label: `#${o.code}`, value: o.id })),
                  ]}
                  aria-label="Link upload to appointment"
                />
              </div>
            )}
            <UploadFileControl
              type={type}
              propertyId={propertyId}
              appointmentId={uploadAppointmentId}
              accept={DOC_ACCEPT}
            />
          </div>
        )}
      </div>

      {/* Hidden input for "New version" uploads. */}
      <input
        ref={versionInputRef}
        type="file"
        accept={DOC_ACCEPT}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleVersionFileChange}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No files match your search' : 'No files yet'}
          description={search ? undefined : 'Uploaded files will appear here.'}
          icon="mdi-file-outline"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((file) => (
            <PropertyFileCard
              key={file.versionGroupId}
              file={file}
              appointmentCode={file.appointmentId ? appointmentRefs?.codeMap[file.appointmentId] ?? null : null}
              onOpenAppointment={onOpenAppointment}
              onOpen={download}
              opening={downloadingId === file.id}
              onViewVersions={
                hasMultipleVersions(files, file.versionGroupId)
                  ? () => setVersionsGroupId(file.versionGroupId)
                  : undefined
              }
              onNewVersion={canVersion ? () => handleNewVersion(file.id) : undefined}
              onDelete={canDelete && deletingId !== file.id ? () => setDeleteTarget(file) : undefined}
            />
          ))}
        </div>
      )}

      <FileVersionsDrawer
        open={versionsGroupId !== null}
        onClose={() => setVersionsGroupId(null)}
        fileName={versionsFileName}
        versions={versionsForDrawer}
        onOpen={download}
        openingId={downloadingId}
        onNewVersion={
          canVersion && versionsForDrawer[0]
            ? () => handleNewVersion(versionsForDrawer[0]!.id)
            : undefined
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) remove(deleteTarget.id);
          setDeleteTarget(null);
        }}
        title="Delete file"
        message={`Delete "${deleteTarget?.fileName ?? ''}"? This can't be undone from the UI.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
