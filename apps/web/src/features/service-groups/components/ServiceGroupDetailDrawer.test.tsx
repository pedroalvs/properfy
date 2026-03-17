import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { ServiceGroupDetailDrawer } from './ServiceGroupDetailDrawer';

function SnackbarDisplay() {
  const { messages } = useSnackbar();
  return (
    <div data-testid="snackbar-display">
      {messages.map((m) => (
        <div key={m.id}>{m.message}</div>
      ))}
    </div>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider>
      {children}
      <SnackbarDisplay />
    </SnackbarProvider>
  );
}

function renderDrawer(props: { serviceGroupId: string | null; open: boolean; onClose?: () => void; onEdit?: (id: string) => void }) {
  return render(
    <Wrapper>
      <ServiceGroupDetailDrawer
        serviceGroupId={props.serviceGroupId}
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
        onEdit={props.onEdit}
      />
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ServiceGroupDetailDrawer', () => {
  it('renders drawer with service group name in header', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('Zona Sul SP');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows status chip in header', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    const matches = screen.getAllByText('Publicado');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows detail sections', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByText('Informações')).toBeInTheDocument();
    expect(screen.getByText('Inspetor')).toBeInTheDocument();
  });

  it('edit button calls showInfo snackbar', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    const editButton = screen.getByLabelText('Editar');
    fireEvent.click(editButton);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByText('Edição em breve')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    const loadingElements = screen.getAllByText('Carregando...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: false });
    act(() => { vi.advanceTimersByTime(200); });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when serviceGroupId is null', () => {
    renderDrawer({ serviceGroupId: null, open: true });
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
    expect(screen.queryByText('Informações')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ serviceGroupId: 'sg-01', open: true, onClose });
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('edit button calls onEdit with service group id when onEdit prop is provided', () => {
    const onEdit = vi.fn();
    renderDrawer({ serviceGroupId: 'sg-01', open: true, onEdit });
    act(() => { vi.advanceTimersByTime(200); });
    const editButton = screen.getByLabelText('Editar');
    fireEvent.click(editButton);
    expect(onEdit).toHaveBeenCalledWith('sg-01');
  });

  it('edit button falls back to snackbar when onEdit prop is not provided', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    act(() => { vi.advanceTimersByTime(200); });
    const editButton = screen.getByLabelText('Editar');
    fireEvent.click(editButton);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByText('Edição em breve')).toBeInTheDocument();
  });
});
