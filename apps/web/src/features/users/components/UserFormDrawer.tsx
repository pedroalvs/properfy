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
import { useSnackbar } from '@/hooks/useSnackbar';
import { useUserDetail } from '../hooks/useUserDetail';
import { useUserSave } from '../hooks/useUserSave';
import { USER_ROLE_OPTIONS, USER_STATUS_OPTIONS, BRANCH_OPTIONS } from '../constants/form-options';
import type { UserFormData, UserFormErrors } from '../types';
import { EMPTY_USER_FORM } from '../types';

interface UserFormDrawerProps {
  open: boolean;
  onClose: () => void;
  userId?: string | null;
  onSaved: () => void;
}

export function UserFormDrawer({
  open,
  onClose,
  userId,
  onSaved,
}: UserFormDrawerProps) {
  const isEditMode = !!userId;
  const { user, isLoading: isLoadingDetail } = useUserDetail(
    isEditMode ? userId : null,
  );
  const { save, isSaving, validate } = useUserSave();
  const { showSuccess, showError } = useSnackbar();

  const [form, setForm] = useState<UserFormData>(EMPTY_USER_FORM);
  const [initialData, setInitialData] = useState<UserFormData>(EMPTY_USER_FORM);
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isEditMode && user) {
      const data: UserFormData = {
        name: user.name,
        email: user.email,
        phone: user.phone ?? '',
        role: user.role,
        status: user.status,
        branchId: user.branchId ?? '',
      };
      setForm(data);
      setInitialData(data);
      setErrors({});
    }
  }, [isEditMode, user]);

  useEffect(() => {
    if (open && !isEditMode) {
      setForm(EMPTY_USER_FORM);
      setInitialData(EMPTY_USER_FORM);
      setErrors({});
    }
  }, [open, isEditMode]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  const updateField = useCallback(
    <K extends keyof UserFormData>(field: K, value: UserFormData[K]) => {
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
    const result = await save(form, userId ?? undefined);
    if (result.success) {
      showSuccess(isEditMode ? 'Usuário atualizado com sucesso' : 'Usuário criado com sucesso');
      onSaved();
    } else {
      showError(result.error ?? 'Failed to save');
    }
  }, [isEditMode, form, validate, save, userId, showSuccess, showError, onSaved]);

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
            title={isEditMode ? 'Editar Usuário' : 'Novo Usuário'}
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
                    <FormField label="Perfil" required error={errors.role}>
                      <SelectInput
                        value={form.role}
                        onChange={(v) => updateField('role', v)}
                        options={USER_ROLE_OPTIONS}
                        placeholder="Selecione o perfil"
                        aria-label="Perfil"
                      />
                    </FormField>
                  </FormSection>

                  <FormSection title="Vínculo" columns={2}>
                    <FormField label="Filial" error={errors.branchId}>
                      <SelectInput
                        value={form.branchId}
                        onChange={(v) => updateField('branchId', v)}
                        options={BRANCH_OPTIONS}
                        placeholder="Nenhuma"
                        aria-label="Filial"
                      />
                    </FormField>
                  </FormSection>

                  {isEditMode && (
                    <FormSection title="Status">
                      <FormField label="Status" error={errors.status}>
                        <SelectInput
                          value={form.status}
                          onChange={(v) => updateField('status', v)}
                          options={USER_STATUS_OPTIONS}
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
                    {isEditMode ? 'Salvar' : 'Criar Usuário'}
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
