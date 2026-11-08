import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotEnoughDataList, type NotEnoughDataInspector } from './NotEnoughDataList';
import { INSPECTOR_IDS } from '../__fixtures__/reliability';

const carla: NotEnoughDataInspector = {
  inspectorId: INSPECTOR_IDS.carla,
  inspectorName: 'Carla Nunes',
  volume: 9,
  status: 'INSUFFICIENT_VOLUME',
};

describe('NotEnoughDataList', () => {
  it('renders nothing when there are no items', () => {
    const { container } = render(<NotEnoughDataList items={[]} minimumVolume={10} onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the heading, explanation and a volume line', () => {
    render(<NotEnoughDataList items={[carla]} minimumVolume={10} onOpen={vi.fn()} />);
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(
      screen.getByText('Inspectors with fewer than 10 services in the last 30 days are not ranked.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Carla Nunes details' })).toHaveTextContent(
      'Carla Nunes · 9 of 10 services',
    );
  });

  it('shows the no-weighted-data line', () => {
    const item: NotEnoughDataInspector = { ...carla, status: 'NO_WEIGHTED_DATA' };
    render(<NotEnoughDataList items={[item]} minimumVolume={10} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Open Carla Nunes details' })).toHaveTextContent(
      'Carla Nunes · No data for the weighted metrics',
    );
  });

  it('opens the drawer on click', () => {
    const onOpen = vi.fn();
    render(<NotEnoughDataList items={[carla]} minimumVolume={10} onOpen={onOpen} />);
    const button = screen.getByRole('button', { name: 'Open Carla Nunes details' });
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(INSPECTOR_IDS.carla, button);
  });
});
