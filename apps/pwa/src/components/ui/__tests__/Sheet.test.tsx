import { render, screen, fireEvent } from '@testing-library/react';
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetHeader,
  SheetTitle,
} from '../Sheet';

function Example({ side }: { side?: 'bottom' | 'right' | 'left' }) {
  return (
    <Sheet defaultOpen>
      <SheetContent side={side} data-testid="sheet-body">
        <SheetHeader>
          <SheetTitle>Offer details</SheetTitle>
        </SheetHeader>
        <SheetClose>Dismiss</SheetClose>
      </SheetContent>
    </Sheet>
  );
}

describe('Sheet', () => {
  it('renders an accessible dialog sheet with a title', () => {
    render(<Example />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Offer details')).toBeInTheDocument();
  });

  it('closes via a SheetClose control', () => {
    render(<Example />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a grab handle for the bottom side and not for the right side', () => {
    const { rerender } = render(<Example side="bottom" />);
    // handle is an aria-hidden div inside the content
    expect(screen.getByTestId('sheet-body').querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    rerender(<Example side="right" />);
    expect(screen.getByTestId('sheet-body').querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });
});
