import type { SelectOption } from '@/components/forms/SelectInput';

export const USER_ROLE_OPTIONS: SelectOption[] = [
  { label: 'Admin Master', value: 'AM' },
  { label: 'Operador', value: 'OP' },
  { label: 'Admin Cliente', value: 'CL_ADMIN' },
  { label: 'Usuário Cliente', value: 'CL_USER' },
  { label: 'Inspetor', value: 'INSP' },
  { label: 'Inquilino', value: 'TNT' },
];

export const USER_STATUS_OPTIONS: SelectOption[] = [
  { label: 'Ativo', value: 'ACTIVE' },
  { label: 'Inativo', value: 'INACTIVE' },
  { label: 'Bloqueado', value: 'LOCKED' },
];
