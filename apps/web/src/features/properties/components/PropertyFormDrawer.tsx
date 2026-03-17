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
import { usePropertyDetail } from '../hooks/usePropertyDetail';
import { usePropertySave } from '../hooks/usePropertySave';
import { PROPERTY_TYPE_OPTIONS, PROPERTY_BRANCH_OPTIONS } from '../mocks/form-options';
import type { PropertyFormData, PropertyFormErrors } from '../types';
import { EMPTY_PROPERTY_FORM } from '../types';

interface PropertyFormDrawerProps {
  open: boolean;
  onClose: () => void;
  propertyId?: string | null;
  onSaved: () => void;
}

export function PropertyFormDrawer({
  open,
  onClose,
  propertyId,
  onSaved,
}: PropertyFormDrawerProps) {
  const isEditMode = !!propertyId;
  const { property, isLoading: isLoadingDetail } = usePropertyDetail(
    isEditMode ? propertyId : null,
  );
  const { save, isSaving, validate } = usePropertySave();
  const { showSuccess } = useSnackbar();

  const [form, setForm] = useState<PropertyFormData>(EMPTY_PROPERTY_FORM);
  const [initialData, setInitialData] = useState<PropertyFormData>(EMPTY_PROPERTY_FORM);
  const [errors, setErrors] = useState<PropertyFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && property) {
      const data: PropertyFormData = {
        propertyCode: property.propertyCode,
        type: property.type,
        branchId: property.branchId ?? '',
        street: property.street,
        addressLine2: property.addressLine2 ?? '',
        suburb: property.suburb,
        postcode: property.postcode,
        state: property.state,
        country: property.country,
        notes: property.notes ?? '',
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, property]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_PROPERTY_FORM);
      setInitialData(EMPTY_PROPERTY_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof PropertyFormData>(field: K, value: PropertyFormData[K]) => {
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
    const success = await save(form, propertyId ?? undefined);
    if (success) {
      showSuccess(isEditMode ? 'Imóvel atualizado com sucesso' : 'Imóvel criado com sucesso');
      onSaved();
    }
  }, [isEditMode, form, validate, save, propertyId, showSuccess, onSaved]);

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
            title={isEditMode ? 'Editar Imóvel' : 'Novo Imóvel'}
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
                  <FormSection title="Identificação" columns={2}>
                    <FormField label="Código do Imóvel" required error={errors.propertyCode}>
                      <TextInput
                        value={form.propertyCode}
                        onChange={(v) => updateField('propertyCode', v)}
                        disabled={isEditMode}
                        aria-label="Código do Imóvel"
                      />
                    </FormField>
                    <FormField label="Tipo" required error={errors.type}>
                      <SelectInput
                        value={form.type}
                        onChange={(v) => updateField('type', v)}
                        options={PROPERTY_TYPE_OPTIONS}
                        placeholder="Selecione o tipo"
                        aria-label="Tipo"
                      />
                    </FormField>
                    <FormField label="Filial" error={errors.branchId}>
                      <SelectInput
                        value={form.branchId}
                        onChange={(v) => updateField('branchId', v)}
                        options={PROPERTY_BRANCH_OPTIONS}
                        placeholder="Selecione a filial"
                        aria-label="Filial"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Endereço" columns={2}>
                    <FormField label="Rua" required error={errors.street}>
                      <TextInput
                        value={form.street}
                        onChange={(v) => updateField('street', v)}
                        aria-label="Rua"
                      />
                    </FormField>
                    <FormField label="Complemento" error={errors.addressLine2}>
                      <TextInput
                        value={form.addressLine2}
                        onChange={(v) => updateField('addressLine2', v)}
                        aria-label="Complemento"
                      />
                    </FormField>
                    <FormField label="Bairro" required error={errors.suburb}>
                      <TextInput
                        value={form.suburb}
                        onChange={(v) => updateField('suburb', v)}
                        aria-label="Bairro"
                      />
                    </FormField>
                    <FormField label="CEP" required error={errors.postcode}>
                      <TextInput
                        value={form.postcode}
                        onChange={(v) => updateField('postcode', v)}
                        aria-label="CEP"
                      />
                    </FormField>
                    <FormField label="Estado" required error={errors.state}>
                      <TextInput
                        value={form.state}
                        onChange={(v) => updateField('state', v)}
                        aria-label="Estado"
                      />
                    </FormField>
                    <FormField label="País" error={errors.country}>
                      <TextInput
                        value={form.country}
                        onChange={(v) => updateField('country', v)}
                        aria-label="País"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Observações">
                    <FormField label="Observações" error={errors.notes}>
                      <Textarea
                        value={form.notes}
                        onChange={(v) => updateField('notes', v)}
                        rows={4}
                        placeholder="Informações adicionais"
                        aria-label="Observações"
                      />
                    </FormField>
                  </FormSection>
                </div>
              </div>

              <div className="border-t border-black/10 px-6 py-4">
                <FormActions>
                  <Button variant="secondary" onClick={handleClose}>
                    Cancelar
                  </Button>
                  <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
                    {isEditMode ? 'Salvar' : 'Criar Imóvel'}
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
