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
import { DateInput } from '@/components/forms/DateInput';
import { Textarea } from '@/components/forms/Textarea';
import { Checkbox } from '@/components/forms/Checkbox';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useAppointmentDetail } from '../hooks/useAppointmentDetail';
import { useAppointmentSave } from '../hooks/useAppointmentSave';
import { TIME_SLOT_OPTIONS } from '../constants/form-options';
import type { AppointmentFormData, AppointmentFormErrors } from '../types';
import { EMPTY_FORM_DATA } from '../types';

interface AppointmentFormDrawerProps {
  open: boolean;
  onClose: () => void;
  appointmentId?: string | null;
  onSaved: () => void;
}

export function AppointmentFormDrawer({
  open,
  onClose,
  appointmentId,
  onSaved,
}: AppointmentFormDrawerProps) {
  const { options: branchOptions } = useFormOptions<{ id: string; name: string }>(
    ['branches', 'form-options'],
    '/v1/branches',
    (item) => ({ value: item.id, label: item.name }),
  );
  const { options: serviceTypeOptions } = useFormOptions<{ id: string; name: string }>(
    ['service-types', 'form-options'],
    '/v1/service-types',
    (item) => ({ value: item.id, label: item.name }),
  );
  const { options: propertyOptions } = useFormOptions<{ id: string; street: string; propertyCode: string }>(
    ['properties', 'form-options'],
    '/v1/properties',
    (item) => ({ value: item.id, label: `${item.propertyCode} - ${item.street}` }),
  );

  const isEditMode = !!appointmentId;
  const { appointment, isLoading: isLoadingDetail } = useAppointmentDetail(
    isEditMode ? appointmentId : null,
  );
  const { save, isSaving, validate } = useAppointmentSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<AppointmentFormData>(EMPTY_FORM_DATA);
  const [initialData, setInitialData] = useState<AppointmentFormData>(EMPTY_FORM_DATA);
  const [errors, setErrors] = useState<AppointmentFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  // Populate form in edit mode
  useEffect(() => {
    if (isEditMode && appointment) {
      const data: AppointmentFormData = {
        branchId: appointment.branchId,
        propertyId: appointment.propertyId,
        serviceTypeId: appointment.serviceTypeId,
        scheduledDate: (appointment.scheduledDate ?? '').split('T')[0] ?? '',
        timeSlot: appointment.timeSlot,
        contactName: appointment.contactName,
        contactPhone: appointment.contactPhone ?? '',
        contactEmail: appointment.contactEmail ?? '',
        keyRequired: appointment.keyRequired,
        meetingLocation: appointment.meetingLocation ?? '',
        keyLocation: appointment.keyLocation ?? '',
        notes: appointment.notes ?? '',
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, appointment]);

  // Reset form when opening in create mode
  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_FORM_DATA);
      setInitialData(EMPTY_FORM_DATA);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof AppointmentFormData>(field: K, value: AppointmentFormData[K]) => {
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

    const result = await save(form, appointmentId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'Vistoria atualizada com sucesso' : 'Vistoria criada com sucesso');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, appointmentId, showSuccess, showError, onSaved]);

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
            title={isEditMode ? 'Editar Vistoria' : 'Nova Vistoria'}
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
                  <FormSection title="Dados da Vistoria" columns={2}>
                    <FormField label="Filial" required error={errors.branchId}>
                      <SelectInput
                        value={form.branchId}
                        onChange={(v) => updateField('branchId', v)}
                        options={branchOptions}
                        placeholder="Selecione a filial"
                        disabled={isEditMode}
                        error={!!errors.branchId}
                        aria-label="Filial"
                      />
                    </FormField>
                    <FormField label="Imóvel" required error={errors.propertyId}>
                      <SelectInput
                        value={form.propertyId}
                        onChange={(v) => updateField('propertyId', v)}
                        options={propertyOptions}
                        placeholder="Selecione o imóvel"
                        disabled={isEditMode}
                        error={!!errors.propertyId}
                        aria-label="Imóvel"
                      />
                    </FormField>
                    <FormField label="Tipo de Serviço" required error={errors.serviceTypeId}>
                      <SelectInput
                        value={form.serviceTypeId}
                        onChange={(v) => updateField('serviceTypeId', v)}
                        options={serviceTypeOptions}
                        placeholder="Selecione o tipo"
                        disabled={isEditMode}
                        error={!!errors.serviceTypeId}
                        aria-label="Tipo de Serviço"
                      />
                    </FormField>
                    <FormField label="Data Agendada" required error={errors.scheduledDate}>
                      <DateInput
                        value={form.scheduledDate}
                        onChange={(v) => updateField('scheduledDate', v)}
                        error={!!errors.scheduledDate}
                        aria-label="Data Agendada"
                      />
                    </FormField>
                    <FormField label="Faixa de Horário" required error={errors.timeSlot}>
                      <SelectInput
                        value={form.timeSlot}
                        onChange={(v) => updateField('timeSlot', v)}
                        options={TIME_SLOT_OPTIONS}
                        placeholder="Selecione o horário"
                        error={!!errors.timeSlot}
                        aria-label="Faixa de Horário"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Contato do Inquilino" columns={2}>
                    <FormField label="Nome do Inquilino" required error={errors.contactName}>
                      <TextInput
                        value={form.contactName}
                        onChange={(v) => updateField('contactName', v)}
                        placeholder="Nome completo"
                        error={!!errors.contactName}
                        aria-label="Nome do Inquilino"
                      />
                    </FormField>
                    <FormField label="Telefone" error={errors.contactPhone}>
                      <TextInput
                        value={form.contactPhone}
                        onChange={(v) => updateField('contactPhone', v)}
                        type="tel"
                        placeholder="(00) 00000-0000"
                        error={!!errors.contactPhone}
                        aria-label="Telefone"
                      />
                    </FormField>
                    <FormField label="E-mail" error={errors.contactEmail}>
                      <TextInput
                        value={form.contactEmail}
                        onChange={(v) => updateField('contactEmail', v)}
                        type="email"
                        placeholder="email@exemplo.com"
                        error={!!errors.contactEmail}
                        aria-label="E-mail"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Acesso e Chave" columns={2}>
                    <div className="flex items-center">
                      <Checkbox
                        label="Chave necessária"
                        checked={form.keyRequired}
                        onChange={(v) => updateField('keyRequired', v)}
                      />
                    </div>
                    <div />
                    <FormField label="Local de Encontro" error={errors.meetingLocation}>
                      <TextInput
                        value={form.meetingLocation}
                        onChange={(v) => updateField('meetingLocation', v)}
                        placeholder="Onde encontrar"
                        aria-label="Local de Encontro"
                      />
                    </FormField>
                    <FormField label="Local da Chave" error={errors.keyLocation}>
                      <TextInput
                        value={form.keyLocation}
                        onChange={(v) => updateField('keyLocation', v)}
                        placeholder="Onde retirar a chave"
                        aria-label="Local da Chave"
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
                    {isEditMode ? 'Salvar' : 'Criar Vistoria'}
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
