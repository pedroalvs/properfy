import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InProgressPanel } from '../InProgressPanel';
import type { ChecklistTemplateItem } from '../../types';

const template: ChecklistTemplateItem[] = [
  { id: '1', label: 'Check walls', type: 'BOOLEAN', required: true, category: 'General' },
  { id: '2', label: 'Notes on floor', type: 'TEXT', required: false, category: 'General' },
];

describe('InProgressPanel', () => {
  const defaultProps = {
    checklistTemplate: template,
    checklistResponses: [],
    onChecklistChange: vi.fn(),
    assets: [],
    onAddPhoto: vi.fn(),
    onDeleteAsset: vi.fn(),
    notes: '',
    onNotesChange: vi.fn(),
    onFinish: vi.fn(),
    isComplete: true,
  };

  it('renders tabs', () => {
    render(<InProgressPanel {...defaultProps} />);
    expect(screen.getByTestId('tab-checklist')).toBeInTheDocument();
    expect(screen.getByTestId('tab-photos')).toBeInTheDocument();
    expect(screen.getByTestId('tab-notes')).toBeInTheDocument();
  });

  it('shows notes textarea with maxLength 2000', async () => {
    const user = userEvent.setup();
    render(<InProgressPanel {...defaultProps} />);
    await user.click(screen.getByTestId('tab-notes'));
    const textarea = screen.getByTestId('notes-textarea');
    expect(textarea).toHaveAttribute('maxLength', '2000');
  });

  it('hides character counter when notes length < 1800', async () => {
    const user = userEvent.setup();
    render(<InProgressPanel {...defaultProps} notes="hello" />);
    await user.click(screen.getByTestId('tab-notes'));
    expect(screen.queryByTestId('notes-char-count')).not.toBeInTheDocument();
  });

  it('shows character counter when notes length >= 1800', async () => {
    const user = userEvent.setup();
    const longNotes = 'a'.repeat(1800);
    render(<InProgressPanel {...defaultProps} notes={longNotes} />);
    await user.click(screen.getByTestId('tab-notes'));
    expect(screen.getByTestId('notes-char-count')).toHaveTextContent('1800/2000');
  });

  it('disables Finish button when isComplete is false', () => {
    render(<InProgressPanel {...defaultProps} isComplete={false} />);
    expect(screen.getByTestId('proceed-to-finish-button')).toBeDisabled();
  });

  it('enables Finish button when isComplete is true', () => {
    render(<InProgressPanel {...defaultProps} isComplete={true} />);
    expect(screen.getByTestId('proceed-to-finish-button')).not.toBeDisabled();
  });

  it('shows checklist progress indicator', () => {
    render(<InProgressPanel {...defaultProps} />);
    expect(screen.getByTestId('checklist-progress')).toBeInTheDocument();
    expect(screen.getByText('0 of 2 checklist items completed')).toBeInTheDocument();
  });

  it('updates progress when items are completed', () => {
    render(
      <InProgressPanel
        {...defaultProps}
        checklistResponses={[{ itemId: '1', value: true }]}
      />,
    );
    expect(screen.getByText('1 of 2 checklist items completed')).toBeInTheDocument();
  });

  it('shows uploading count in finish button when uploads pending', () => {
    render(
      <InProgressPanel {...defaultProps} isComplete={false} uploadingCount={3} />,
    );
    expect(screen.getByTestId('proceed-to-finish-button')).toHaveTextContent(
      'Uploading photos... 3 remaining',
    );
  });

  it('shows required remaining in finish button when checklist incomplete', () => {
    render(
      <InProgressPanel {...defaultProps} isComplete={false} requiredRemaining={2} />,
    );
    expect(screen.getByTestId('proceed-to-finish-button')).toHaveTextContent(
      '2 required items remaining',
    );
  });

  it('shows "Proceed to Finish" when complete', () => {
    render(<InProgressPanel {...defaultProps} isComplete={true} />);
    expect(screen.getByTestId('proceed-to-finish-button')).toHaveTextContent('Proceed to Finish');
  });
});
