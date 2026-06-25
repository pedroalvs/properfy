import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlowTypeChip } from './FlowTypeChip';

describe('FlowTypeChip', () => {
  it.each([
    ['ROUTINE', 'Routine'],
    ['INGOING', 'Ingoing'],
    ['OUTGOING', 'Outgoing'],
  ])('renders correct label for %s', (flowType, expectedLabel) => {
    render(<FlowTypeChip flowType={flowType} />);
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });

  it('falls back to raw value for unknown flow type', () => {
    render(<FlowTypeChip flowType="UNKNOWN" />);
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
  });
});
