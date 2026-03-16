import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@properfy/shared';
import { UserRoleChip } from './UserRoleChip';

const ROLE_LABELS: Record<UserRole, string> = {
  AM: 'Admin Master',
  OP: 'Operador',
  CL_ADMIN: 'Admin Cliente',
  CL_USER: 'Usuário Cliente',
  INSP: 'Inspetor',
  TNT: 'Inquilino',
};

describe('UserRoleChip', () => {
  it.each(Object.entries(ROLE_LABELS))(
    'renders correct label for %s',
    (role, label) => {
      render(<UserRoleChip role={role as UserRole} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through', () => {
    render(<UserRoleChip role={UserRole.AM} className="my-custom" />);
    const chip = screen.getByText('Admin Master');
    expect(chip.className).toContain('my-custom');
  });
});
