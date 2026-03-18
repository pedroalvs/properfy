import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/forms/TextInput';
import { FormField } from '@/components/forms/FormField';

interface ManualAssignModalProps {
  open: boolean;
  onClose: () => void;
  onAssign: (inspectorId: string) => void;
  serviceGroupId: string;
}

export function ManualAssignModal({ open, onClose, onAssign, serviceGroupId: _serviceGroupId }: ManualAssignModalProps) {
  const [inspectorSearch, setInspectorSearch] = useState('');

  const handleAssign = () => {
    if (inspectorSearch.trim()) {
      onAssign(inspectorSearch.trim());
      setInspectorSearch('');
    }
  };

  const handleClose = () => {
    setInspectorSearch('');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Assign Inspector"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleAssign}
            disabled={!inspectorSearch.trim()}
          >
            Assign
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-text-secondary">
        Search for an inspector to manually assign to this service group.
      </p>
      <FormField label="Inspector">
        <TextInput
          value={inspectorSearch}
          onChange={setInspectorSearch}
          placeholder="Search inspector by name or ID"
          aria-label="Inspector search"
        />
      </FormField>
    </Dialog>
  );
}
