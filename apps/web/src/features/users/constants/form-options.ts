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

export const BRANCH_OPTIONS: SelectOption[] = [
  { label: 'Filial Centro', value: 'b-1' },
  { label: 'Filial Zona Sul', value: 'b-2' },
  { label: 'Matriz', value: 'b-3' },
];
