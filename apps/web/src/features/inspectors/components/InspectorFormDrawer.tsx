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
import { useInspectorDetail } from '../hooks/useInspectorDetail';
import { useInspectorSave } from '../hooks/useInspectorSave';
import { INSPECTOR_STATUS_OPTIONS } from '../mocks/form-options';
import type { InspectorFormData, InspectorFormErrors } from '../types';
import { EMPTY_INSPECTOR_FORM } from '../types';

interface InspectorFormDrawerProps {
  open: boolean;
  onClose: () => void;
  inspectorId?: string | null;
  onSaved: () => void;
}

export function InspectorFormDrawer({
  open,
  onClose,
  inspectorId,
  onSaved,
}: InspectorFormDrawerProps) {
  const isEditMode = !!inspectorId;
  const { inspector, isLoading: isLoadingDetail } = useInspectorDetail(
    isEditMode ? inspectorId : null,
  );
  const { save, isSaving, validate } = useInspectorSave();
  const { showSuccess } = useSnackbar();

  const [form, setForm] = useState<InspectorFormData>(EMPTY_INSPECTOR_FORM);
  const [initialData, setInitialData] = useState<InspectorFormData>(EMPTY_INSPECTOR_FORM);
  const [errors, setErrors] = useState<InspectorFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && inspector) {
      const data: InspectorFormData = {
        name: inspector.name,
        email: inspector.email,
        phone: inspector.phone ?? '',
        document: inspector.document ?? '',
        status: inspector.status,
        regions: inspector.regions.join(', '),
        serviceTypes: inspector.serviceTypes.join(', '),
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, inspector]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_INSPECTOR_FORM);
      setInitialData(EMPTY_INSPECTOR_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof InspectorFormData>(field: K, value: InspectorFormData[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        if (prev[field]) {
          const next = { ...prev };
          delete next[field];
          return next;
        }
        return prev;
      });
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    const mode = isEditMode ? 'edit' : 'create';
    const validationErrors = validate(form, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    const success = await save(form, inspectorId ?? undefined);
    if (success) {
      showSuccess(isEditMode ? 'Inspetor atualizado com sucesso' : 'Inspetor criado com sucesso');
      onSaved();
    }
  }, [isEditMode, form, validate, save, inspectorId, showSuccess, onSaved]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const forceClose = useCallback(() => {
    setShowConfirm(false);
    onClose();
  }, [onClose]);

  const cancelDiscard = useCallback(() => {
    setShowConfirm(false);
  }, []);

  return (
    <>
      <DrawerPanel open={open} onClose={handleClose} size="wide">
        <div className="flex h-full flex-col">
          <DrawerHeader
            title={isEditMode ? 'Editar Inspetor' : 'Novo Inspetor'}
            onClose={handleClose}
          />
          {isEditMode && isLoadingDetail ? (
            <div className="flex-1 px-6 py-4">
              <LoadingState rows={6} />
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="flex flex-col gap-6">
                  <FormSection title="Dados Pessoais" columns={2}>
                    <FormField label="Nome" required error={errors.name}>
                      <TextInput
                        value={form.name}
                        onChange={(v) => updateField('name', v)}
                        aria-label="Nome"
                      />
                    </FormField>
                    <FormField label="E-mail" required error={errors.email}>
                      <TextInput
                        value={form.email}
                        onChange={(v) => updateField('email', v)}
                        aria-label="E-mail"
                      />
                    </FormField>
                    <FormField label="Telefone" error={errors.phone}>
                      <TextInput
                        value={form.phone}
                        onChange={(v) => updateField('phone', v)}
                        type="tel"
                        aria-label="Telefone"
                      />
                    </FormField>
                    <FormField label="CPF" error={errors.document}>
                      <TextInput
                        value={form.document}
                        onChange={(v) => updateField('document', v)}
                        aria-label="CPF"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Atuação" columns={2}>
                    <FormField label="Regiões" error={errors.regions}>
                      <Textarea
                        value={form.regions}
                        onChange={(v) => updateField('regions', v)}
                        rows={2}
                        placeholder="Separados por vírgula"
                        aria-label="Regiões"
                      />
                    </FormField>
                    <FormField label="Tipos de Serviço" error={errors.serviceTypes}>
                      <Textarea
                        value={form.serviceTypes}
                        onChange={(v) => updateField('serviceTypes', v)}
                        rows={2}
                        placeholder="Separados por vírgula"
                        aria-label="Tipos de Serviço"
                      />
                    </FormField>
                  </FormSection>

                  {isEditMode && (
                    <FormSection title="Status">
                      <FormField label="Status" error={errors.status}>
                        <SelectInput
                          value={form.status}
                          onChange={(v) => updateField('status', v)}
                          options={INSPECTOR_STATUS_OPTIONS}
                          aria-label="Status"
                        />
                      </FormField>
                    </FormSection>
                  )}
                </div>
              </div>

              <div className="border-t border-black/10 px-6 py-4">
                <FormActions>
                  <Button variant="secondary" onClick={handleClose}>
                    Cancelar
                  </Button>
                  <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                    {isEditMode ? 'Salvar' : 'Criar Inspetor'}
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
