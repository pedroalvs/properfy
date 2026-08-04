import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { InspectorWorkloadResponse } from '@properfy/shared';
import { WorkloadKpiGrid } from './WorkloadKpiGrid';
import { WorkloadAlertBanner } from './WorkloadAlertBanner';

const THRESHOLDS: InspectorWorkloadResponse['thresholds'] = {
  weeklyBusy: 15,
  weeklyOverloaded: 18,
  dailyBusy: 3,
  dailyOverloaded: 4,
};

function kpis(overrides: Partial<InspectorWorkloadResponse['kpis']> = {}): InspectorWorkloadResponse['kpis'] {
  return {
    totalInWeek: 21,
    activeInspectorCount: 2,
    avgPerInspector: 10.5,
    nearLimit: { count: 0, inspectors: [] },
    overloaded: { count: 0, inspectors: [] },
    ...overrides,
  };
}

const ALICE = { inspectorId: 'a', inspectorName: 'Alice', total: 16 };
const BOB = { inspectorId: 'b', inspectorName: 'Bob', total: 20 };
const CARLA = { inspectorId: 'c', inspectorName: 'Carla', total: 19 };

describe('WorkloadKpiGrid', () => {
  it('renders an em dash rather than NaN when there is no roster', () => {
    render(
      <WorkloadKpiGrid
        kpis={kpis({ avgPerInspector: null, activeInspectorCount: 0 })}
        thresholds={THRESHOLDS}
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('prints the denominator alongside the average', () => {
    render(<WorkloadKpiGrid kpis={kpis()} thresholds={THRESHOLDS} />);

    expect(screen.getByText('10.5')).toBeInTheDocument();
    expect(screen.getByText('Across 2 active inspectors')).toBeInTheDocument();
  });

  it('singularises the roster hint for one inspector', () => {
    render(<WorkloadKpiGrid kpis={kpis({ activeInspectorCount: 1 })} thresholds={THRESHOLDS} />);

    expect(screen.getByText('Across 1 active inspector')).toBeInTheDocument();
  });

  it('labels the tiles with the actual thresholds', () => {
    render(<WorkloadKpiGrid kpis={kpis()} thresholds={THRESHOLDS} />);

    expect(screen.getByText('Near limit (15+)')).toBeInTheDocument();
    expect(screen.getByText('Overloaded (18+)')).toBeInTheDocument();
  });

  it('lists who is near the limit and who is over it', () => {
    render(
      <WorkloadKpiGrid
        kpis={kpis({
          nearLimit: { count: 1, inspectors: [ALICE] },
          overloaded: { count: 2, inspectors: [BOB, CARLA] },
        })}
        thresholds={THRESHOLDS}
      />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob and Carla')).toBeInTheDocument();
  });

  it('says so explicitly when a list is empty, rather than showing a blank hint', () => {
    render(<WorkloadKpiGrid kpis={kpis()} thresholds={THRESHOLDS} />);

    expect(screen.getByText('Nobody approaching the limit')).toBeInTheDocument();
    expect(screen.getByText('Nobody over the limit')).toBeInTheDocument();
  });
});

describe('WorkloadAlertBanner', () => {
  it('gives an all clear rather than disappearing when nothing is wrong', () => {
    render(<WorkloadAlertBanner kpis={kpis()} thresholds={THRESHOLDS} />);

    expect(
      screen.getByText(/Every inspector is under the weekly limit of 15/),
    ).toBeInTheDocument();
  });

  it('uses the alert role when someone is overloaded', () => {
    render(
      <WorkloadAlertBanner
        kpis={kpis({ overloaded: { count: 2, inspectors: [BOB, CARLA] } })}
        thresholds={THRESHOLDS}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      '2 inspectors are at or above the overload threshold',
    );
  });

  it('singularises for a single inspector', () => {
    render(
      <WorkloadAlertBanner
        kpis={kpis({ overloaded: { count: 1, inspectors: [BOB] } })}
        thresholds={THRESHOLDS}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      '1 inspector is at or above the overload threshold',
    );
  });

  it('warns rather than alerts when only the near-limit band is populated', () => {
    render(
      <WorkloadAlertBanner
        kpis={kpis({ nearLimit: { count: 3, inspectors: [ALICE] } })}
        thresholds={THRESHOLDS}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('3 inspectors are approaching it (15+)');
  });
});
