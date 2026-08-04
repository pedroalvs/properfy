import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StarRatingInput } from './StarRatingInput';

function setup(props: Partial<React.ComponentProps<typeof StarRatingInput>> = {}) {
  const onChange = vi.fn();
  render(<StarRatingInput value={null} onChange={onChange} label="How satisfied were you?" {...props} />);
  return { onChange };
}

describe('StarRatingInput', () => {
  it('exposes a radiogroup of five radios', () => {
    setup();

    expect(screen.getByRole('radiogroup', { name: 'How satisfied were you?' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('names each star with its meaning, not just its position', () => {
    setup();

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveAccessibleName(/1 star/i);
    expect(radios[0]).toHaveAccessibleName(/very poor/i);
    expect(radios[4]).toHaveAccessibleName(/5 stars/i);
    expect(radios[4]).toHaveAccessibleName(/excellent/i);
  });

  it('reports the picked value and checks exactly one star', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ value: 4 });

    await user.click(screen.getAllByRole('radio')[3]!);

    expect(onChange).toHaveBeenCalledWith(4);
    expect(screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });

  it('keeps a single tab stop via roving tabindex', async () => {
    // Five tab stops for one control would make the form tedious to traverse.
    setup({ value: 3 });

    const radios = screen.getAllByRole('radio');
    expect(radios.filter((r) => r.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(radios[2]).toHaveAttribute('tabindex', '0');
  });

  it('puts the first star in the tab order when nothing is picked', () => {
    setup({ value: null });

    expect(screen.getAllByRole('radio')[0]).toHaveAttribute('tabindex', '0');
  });

  it('moves and selects with arrow keys', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ value: 3 });

    screen.getAllByRole('radio')[2]!.focus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('wraps at both ends, as the radiogroup pattern requires', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ value: 5 });

    screen.getAllByRole('radio')[4]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith(1);

    onChange.mockClear();
    screen.getAllByRole('radio')[4]!.focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('jumps to the ends with Home and End', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ value: 3 });

    screen.getAllByRole('radio')[2]!.focus();
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenCalledWith(1);

    await user.keyboard('{End}');
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('ignores pointer and keyboard input when disabled', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ value: 3, disabled: true });

    await user.click(screen.getAllByRole('radio')[4]!);
    screen.getAllByRole('radio')[2]!.focus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('surfaces an error message to assistive tech', () => {
    setup({ error: 'Select a rating to continue' });

    expect(screen.getByRole('alert')).toHaveTextContent('Select a rating to continue');
  });
});
