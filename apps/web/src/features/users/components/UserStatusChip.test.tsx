import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserStatus } from '@properfy/shared';
import { UserStatusChip } from './UserStatusChip';

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  LOCKED: 'Bloqueado',
};

describe('UserStatusChip', () => {
  it.each(Object.entries(STATUS_LABELS))(
    'renders correct label for %s',
    (status, label) => {
      render(<UserStatusChip status={status as UserStatus} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through', () => {
    render(<UserStatusChip status={UserStatus.ACTIVE} className="my-custom" />);
    const chip = screen.getByText('Ativo');
    expect(chip.className).toContain('my-custom');
  });
});
