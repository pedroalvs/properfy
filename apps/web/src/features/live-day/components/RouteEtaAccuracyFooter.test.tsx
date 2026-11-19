import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RouteEtaAccuracy } from '@properfy/shared';
import { RouteEtaAccuracyFooter } from './RouteEtaAccuracyFooter';

function acc(over: Partial<RouteEtaAccuracy>): RouteEtaAccuracy {
  return {
    days: 30,
    sampleSize: 214,
    excludedOutliers: 0,
    meanAbsoluteErrorMinutes: 6.2,
    thresholdMinutes: 10,
    minSampleSize: 30,
    status: 'OK',
    ...over,
  } as RouteEtaAccuracy;
}

describe('RouteEtaAccuracyFooter', () => {
  it('OK', () => {
    render(<RouteEtaAccuracyFooter accuracy={acc({ status: 'OK' })} isLoading={false} isError={false} />);
    expect(screen.getByTestId('route-eta-accuracy')).toHaveTextContent(
      'Route ETA accuracy (30 days): 6.2 min average error · 214 stops',
    );
  });

  it('ABOVE_THRESHOLD adds the target note in a warning tone', () => {
    render(
      <RouteEtaAccuracyFooter
        accuracy={acc({ status: 'ABOVE_THRESHOLD', meanAbsoluteErrorMinutes: 12.4 })}
        isLoading={false}
        isError={false}
      />,
    );
    const el = screen.getByTestId('route-eta-accuracy');
    expect(el).toHaveTextContent('Route ETA accuracy (30 days): 12.4 min average error · 214 stops · Above the 10 min target');
    expect(el.className).toContain('text-warning');
  });

  it('INSUFFICIENT_DATA with some samples', () => {
    render(
      <RouteEtaAccuracyFooter
        accuracy={acc({ status: 'INSUFFICIENT_DATA', sampleSize: 12, meanAbsoluteErrorMinutes: 5 })}
        isLoading={false}
        isError={false}
      />,
    );
    expect(screen.getByTestId('route-eta-accuracy')).toHaveTextContent(
      'Route ETA accuracy: not enough data yet (12 of 30 stops)',
    );
  });

  it('no data yet when sampleSize is 0', () => {
    render(
      <RouteEtaAccuracyFooter
        accuracy={acc({ status: 'INSUFFICIENT_DATA', sampleSize: 0, meanAbsoluteErrorMinutes: null })}
        isLoading={false}
        isError={false}
      />,
    );
    expect(screen.getByTestId('route-eta-accuracy')).toHaveTextContent('Route ETA accuracy: no data yet');
  });

  it('unavailable on error', () => {
    render(<RouteEtaAccuracyFooter accuracy={null} isLoading={false} isError />);
    expect(screen.getByTestId('route-eta-accuracy')).toHaveTextContent('Route ETA accuracy unavailable');
  });

  it('loading placeholder', () => {
    render(<RouteEtaAccuracyFooter accuracy={null} isLoading isError={false} />);
    expect(screen.getByTestId('route-eta-accuracy')).toHaveTextContent('Route ETA accuracy…');
  });
});
