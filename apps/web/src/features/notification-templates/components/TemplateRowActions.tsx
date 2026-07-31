import { useState } from 'react';
import { RowActions, type RowAction } from '@/components/data/RowActions';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useTemplateDelete } from '../hooks/useTemplateDelete';
import { MANDATORY_TEMPLATE_CODES, type NotificationTemplate } from '../types';

interface TemplateRowActionsProps {
  template: NotificationTemplate;
  onEdit?: (template: NotificationTemplate) => void;
  onDeleted?: () => void;
  /** AM/OP only — hard delete is restricted to operators. */
  canDelete?: boolean;
}

export function TemplateRowActions({ template, onEdit, onDeleted, canDelete }: TemplateRowActionsProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const { deleteTemplate, isDeleting } = useTemplateDelete();
  const { showSuccess, showError } = useSnackbar();

  // Only agency overrides are deletable; platform defaults are never deleted.
  const isOverride = template.tenantId !== null;
  const showDelete = !!canDelete && isOverride;

  // The list also shows platform rows for codes outside the mandatory catalog
  // (PASSWORD_RESET, INSPECTION_STUCK_ALERT, INSPECTOR_GROUP_*). The upsert use
  // case refuses those with 400 "Invalid template code", so offering Edit only
  // led operators into a save that could never succeed.
  const canEdit = (MANDATORY_TEMPLATE_CODES as readonly string[]).includes(template.code);

  const actions: RowAction[] = [];
  if (canEdit) {
    actions.push({ icon: 'mdi-pencil-outline', label: 'Edit', onClick: () => onEdit?.(template) });
  }
  if (showDelete) {
    actions.push({
      icon: 'mdi-delete-outline',
      label: 'Delete',
      variant: 'delete',
      disabled: isDeleting,
      onClick: () => setShowConfirm(true),
    });
  }

  const handleDelete = async () => {
    const result = await deleteTemplate(template.id);
    setShowConfirm(false);
    if (result.success) {
      showSuccess('Custom template deleted');
      onDeleted?.();
    } else {
      showError(result.error ?? 'Failed to delete template');
    }
  };

  return (
    <>
      <RowActions actions={actions} />
      <ConfirmDialog
        open={showConfirm}
        title="Delete custom template?"
        message="This removes the agency override. Notifications will fall back to the platform default."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setShowConfirm(false)}
      />
    </>
  );
}
