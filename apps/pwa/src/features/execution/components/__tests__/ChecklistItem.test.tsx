import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChecklistItem } from '../ChecklistItem';
import type { ChecklistTemplateItem } from '../../types';

describe('ChecklistItem', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockClear();
  });

  it('renders BOOLEAN toggle buttons', () => {
    const item: ChecklistTemplateItem = {
      id: 'item-1',
      label: 'Is the property clean?',
      type: 'BOOLEAN',
      required: true,
      category: 'General',
    };
    render(<ChecklistItem item={item} response={undefined} onChange={onChange} />);
    expect(screen.getByTestId('checklist-item-1-yes')).toBeInTheDocument();
    expect(screen.getByTestId('checklist-item-1-no')).toBeInTheDocument();
  });

  it('calls onChange with true on Yes click', async () => {
    const user = userEvent.setup();
    const item: ChecklistTemplateItem = {
      id: 'item-1',
      label: 'Clean?',
      type: 'BOOLEAN',
      required: false,
      category: 'General',
    };
    render(<ChecklistItem item={item} response={undefined} onChange={onChange} />);
    await user.click(screen.getByTestId('checklist-item-1-yes'));
    expect(onChange).toHaveBeenCalledWith({ itemId: 'item-1', value: true });
  });

  it('renders TEXT input', () => {
    const item: ChecklistTemplateItem = {
      id: 'item-2',
      label: 'Notes',
      type: 'TEXT',
      required: false,
      category: 'General',
    };
    render(<ChecklistItem item={item} response={undefined} onChange={onChange} />);
    expect(screen.getByTestId('checklist-item-2-text')).toBeInTheDocument();
  });

  it('renders RATING stars', () => {
    const item: ChecklistTemplateItem = {
      id: 'item-3',
      label: 'Condition',
      type: 'RATING',
      required: true,
      category: 'General',
    };
    render(<ChecklistItem item={item} response={undefined} onChange={onChange} />);
    expect(screen.getByTestId('checklist-item-3-rating')).toBeInTheDocument();
    expect(screen.getByLabelText('3 stars')).toBeInTheDocument();
  });

  it('calls onChange with rating value on star click', async () => {
    const user = userEvent.setup();
    const item: ChecklistTemplateItem = {
      id: 'item-3',
      label: 'Condition',
      type: 'RATING',
      required: true,
      category: 'General',
    };
    render(<ChecklistItem item={item} response={undefined} onChange={onChange} />);
    await user.click(screen.getByLabelText('4 stars'));
    expect(onChange).toHaveBeenCalledWith({ itemId: 'item-3', value: 4 });
  });

  it('shows required indicator', () => {
    const item: ChecklistTemplateItem = {
      id: 'item-1',
      label: 'Required item',
      type: 'BOOLEAN',
      required: true,
      category: 'General',
    };
    render(<ChecklistItem item={item} response={undefined} onChange={onChange} />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});
