import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PropertyType } from '@properfy/shared';
import { PropertyTypeChip } from './PropertyTypeChip';

const TYPE_LABELS: Record<PropertyType, string> = {
  RESIDENTIAL: 'Residencial',
  COMMERCIAL: 'Comercial',
  INDUSTRIAL: 'Industrial',
  RURAL: 'Rural',
};

describe('PropertyTypeChip', () => {
  it.each(Object.entries(TYPE_LABELS))(
    'renders correct label for %s',
    (type, label) => {
      render(<PropertyTypeChip type={type as PropertyType} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through', () => {
    render(<PropertyTypeChip type={PropertyType.RESIDENTIAL} className="my-custom" />);
    const chip = screen.getByText('Residencial');
    expect(chip.className).toContain('my-custom');
  });
});
