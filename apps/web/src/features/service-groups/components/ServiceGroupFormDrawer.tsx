import { useState, useEffect, useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormSection } from '@/components/forms/FormSection';
import { FormField } from '@/components/forms/FormField';
import { FormActions } from '@/components/forms/FormActions';
import { TextInput } from '@/components/forms/TextInput';
import { SelectInput } from '@/components/forms/SelectInput';
import { Textarea } from '@/components/forms/Textarea';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useServiceGroupDetail } from '../hooks/useServiceGroupDetail';
import { useServiceGroupSave } from '../hooks/useServiceGroupSave';
import { PRIORITY_MODE_OPTIONS } from '../constants/form-options';
import type { ServiceGroupFormData, ServiceGroupFormErrors } from '../types';
import { EMPTY_SERVICE_GROUP_FORM } from '../types';

interface ServiceGroupFormDrawerProps {
  open: boolean;
  onClose: () => void;
  serviceGroupId?: string | null;
  onSaved: () => void;
}

export function ServiceGroupFormDrawer({ open, onClose, serviceGroupId, onSaved }: ServiceGroupFormDrawerProps) {
  const isEditMode = !!serviceGroupId;
  const { serviceGroup, isLoading: isLoadingDetail } = useServiceGroupDetail(isEditMode ? serviceGroupId : null);
  const { save, isSaving, validate } = useServiceGroupSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<ServiceGroupFormData>(EMPTY_SERVICE_GROUP_FORM);
  const [initialData, setInitialData] = useState<ServiceGroupFormData>(EMPTY_SERVICE_GROUP_FORM);
  const [errors, setErrors] = useState<ServiceGroupFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && serviceGroup) {
      const data: ServiceGroupFormData = {
        name: serviceGroup.name,
        regionName: serviceGroup.regionName ?? '',
        priorityMode: serviceGroup.priorityMode,
        description: serviceGroup.description ?? '',
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, serviceGroup]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_SERVICE_GROUP_FORM);
      setInitialData(EMPTY_SERVICE_GROUP_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(<K extends keyof ServiceGroupFormData>(field: K, value: ServiceGroupFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (prev[field]) { const next = { ...prev }; delete next[field]; return next; }
      return prev;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const mode = isEditMode ? 'edit' : 'create';
    const validationErrors = validate(form, mode);
    if (Object.keys(validationErrors).length > 0) { setErrors(validationErrors); return; }
    const result = await save(form, serviceGroupId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'Grupo atualizado com sucesso' : 'Grupo criado com sucesso');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, serviceGroupId, showSuccess, showError, onSaved]);

  const handleClose = useCallback(() => {
    if (isDirty) { setShowConfirm(true); } else { onClose(); }
  }, [isDirty, onClose]);

  const forceClose = useCallback(() => { setShowConfirm(false); onClose(); }, [onClose]);
  const cancelDiscard = useCallback(() => { setShowConfirm(false); }, []);

  return (
    <>
      <DrawerPanel open={open} onClose={handleClose} size="wide">
        <div className="flex h-full flex-col">
          <DrawerHeader title={isEditMode ? 'Editar Grupo' : 'Novo Grupo'} onClose={handleClose} />
          {isEditMode && isLoadingDetail ? (
            <div className="flex-1 px-6 py-4"><LoadingState rows={6} /></div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="flex flex-col gap-6">
                  <FormSection title="Informações" columns={2}>
                    <FormField label="Nome" required error={errors.name}>
                      <TextInput value={form.name} onChange={(v) => updateField('name', v)} aria-label="Nome" />
                    </FormField>
                    <FormField label="Região" error={errors.regionName}>
                      <TextInput value={form.regionName} onChange={(v) => updateField('regionName', v)} aria-label="Região" />
                    </FormField>
                    <FormField label="Prioridade" required error={errors.priorityMode}>
                      <SelectInput
                        value={form.priorityMode}
                        onChange={(v) => updateField('priorityMode', v)}
                        options={PRIORITY_MODE_OPTIONS}
                        placeholder="Selecione a prioridade"
                        aria-label="Prioridade"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Observações">
                    <FormField label="Descrição" error={errors.description}>
                      <Textarea
                        value={form.description}
                        onChange={(v) => updateField('description', v)}
                        rows={3}
                        placeholder="Descrição opcional do grupo"
                        aria-label="Descrição"
                      />
                    </FormField>
                  </FormSection>
                </div>
              </div>
              <div className="border-t border-black/10 px-6 py-4">
                <FormActions>
                  <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
                  <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                    {isEditMode ? 'Salvar' : 'Criar Grupo'}
                  </Button>
                </FormActions>
              </div>
            </>
          )}
        </div>
      </DrawerPanel>
      <ConfirmDialog
        open={showConfirm}
        title="Descartar alterações?"
        message="Você tem alterações não salvas. Deseja descartá-las?"
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        variant="warning"
        onConfirm={forceClose}
        onClose={cancelDiscard}
      />
    </>
  );
}
