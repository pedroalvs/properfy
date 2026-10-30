import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InspectorStatus } from '@properfy/shared';
import { InspectorTable } from './InspectorTable';
import type { Inspector } from '../types';

function makeInspector(overrides: Partial<Inspector> = {}): Inspector {
  return {
    id: 'insp-1',
    name: 'Carlos Inspetor',
    email: 'carlos@inspecoes.com',
    phone: '11999999999',
    status: InspectorStatus.ACTIVE,
    regionsCount: 3,
    serviceTypesCount: 5,
    ratingAvg: 4.8,
    ratingCount: 12,
    completedCount: 245,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
    // F01-2 defaults: a located base (no badge) and a fully-adopted app.
    address: { street: '1 George St', suburb: 'Sydney', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
    baseLat: -33.8688,
    baseGeocodedAt: '2026-01-10T10:00:00Z',
    appInstalledAt: '2026-01-05T08:00:00Z',
    appLastSeenAt: '2026-01-10T09:00:00Z',
    pushEnabled: true,
    appVersion: '0.1.0+ab12cd3',
    ...overrides,
  };
}

describe('InspectorTable', () => {
  it('renders column headers', () => {
    render(<InspectorTable data={[]} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Regions')).toBeInTheDocument();
    // Renamed from "Services" — it counts service TYPES, and a second "Services"
    // column next to the completed-inspections count would be ambiguous.
    expect(screen.getByText('Service Types')).toBeInTheDocument();
    expect(screen.queryByText('Services')).not.toBeInTheDocument();
    expect(screen.getByText('Rating')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  describe('rating column', () => {
    it('shows the average, the response count and the completed total', () => {
      render(<InspectorTable data={[makeInspector()]} />);

      expect(screen.getByText('4.80')).toBeInTheDocument();
      expect(screen.getByText('(12)')).toBeInTheDocument();
      expect(screen.getByText('245')).toBeInTheDocument();
    });

    it('shows a dash rather than a zero score for an unrated inspector', () => {
      render(<InspectorTable data={[makeInspector({ ratingAvg: null, ratingCount: 0 })]} />);

      expect(screen.queryByText('0.00')).not.toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('keeps unrated inspectors last in both sort directions', async () => {
      // compareValues sends nullish last regardless of direction, which is what
      // stops an unrated inspector from topping an ascending sort. This only
      // holds because ratingAvg is null, never 0.
      const user = userEvent.setup();
      render(
        <InspectorTable
          data={[
            makeInspector({ id: 'a', name: 'Unrated', ratingAvg: null, ratingCount: 0 }),
            makeInspector({ id: 'b', name: 'Rated', ratingAvg: 3.2, ratingCount: 4 }),
          ]}
        />,
      );

      const header = screen.getByText('Rating');
      const namesInOrder = () =>
        screen.getAllByText(/^(Unrated|Rated)$/).map((el) => el.textContent);

      await user.click(header);
      expect(namesInOrder()[1]).toBe('Unrated');

      await user.click(header);
      expect(namesInOrder()[1]).toBe('Unrated');
    });
  });

  it('renders inspector data (name, email, regions/services counts)', () => {
    const insp = makeInspector();
    render(<InspectorTable data={[insp]} />);
    expect(screen.getByText('Carlos Inspetor')).toBeInTheDocument();
    expect(screen.getByText('carlos@inspecoes.com')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders InspectorStatusChip', () => {
    const insp = makeInspector({ status: InspectorStatus.INACTIVE });
    render(<InspectorTable data={[insp]} />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders em dash for null phone', () => {
    const insp = makeInspector({ phone: null });
    render(<InspectorTable data={[insp]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<InspectorTable data={[]} loading />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<InspectorTable data={[]} />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<InspectorTable data={[]} error="Network error" />);
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('view action calls onView with correct inspector', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const insp = makeInspector();
    render(<InspectorTable data={[insp]} onView={onView} />);
    await user.click(screen.getByLabelText('View'));
    expect(onView).toHaveBeenCalledWith(insp);
  });

  it('does not render pencil edit action (014 FR-019b)', () => {
    const insp = makeInspector();
    render(<InspectorTable data={[insp]} />);
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
  });

  describe('F01-2 app adoption columns + base-address badge', () => {
    it('renders the App, Push and Last seen headers', () => {
      render(<InspectorTable data={[]} />);
      expect(screen.getByText('App')).toBeInTheDocument();
      expect(screen.getByText('Push')).toBeInTheDocument();
      expect(screen.getByText('Last seen')).toBeInTheDocument();
    });

    it('shows "Installed" when the app was installed and "—" otherwise', () => {
      const { rerender } = render(<InspectorTable data={[makeInspector()]} />);
      expect(screen.getByText('Installed')).toBeInTheDocument();

      rerender(<InspectorTable data={[makeInspector({ appInstalledAt: null })]} />);
      expect(screen.queryByText('Installed')).not.toBeInTheDocument();
    });

    it('shows Push On / Off / — for true / false / null', () => {
      const { rerender } = render(<InspectorTable data={[makeInspector({ pushEnabled: true })]} />);
      expect(screen.getByText('On')).toBeInTheDocument();

      rerender(<InspectorTable data={[makeInspector({ pushEnabled: false })]} />);
      expect(screen.getByText('Off')).toBeInTheDocument();

      rerender(<InspectorTable data={[makeInspector({ pushEnabled: null })]} />);
      expect(screen.queryByText('On')).not.toBeInTheDocument();
      expect(screen.queryByText('Off')).not.toBeInTheDocument();
    });

    it('shows Push "Off" for a deactivated inspector with pushEnabled false (L-F02-11)', () => {
      render(<InspectorTable data={[makeInspector({ status: InspectorStatus.INACTIVE, pushEnabled: false })]} />);
      expect(screen.getByText('Off')).toBeInTheDocument();
    });

    it('shows "Never" for a null last seen and a relative value otherwise', () => {
      const { rerender } = render(<InspectorTable data={[makeInspector({ appLastSeenAt: null })]} />);
      expect(screen.getByText('Never')).toBeInTheDocument();

      rerender(<InspectorTable data={[makeInspector({ appLastSeenAt: new Date().toISOString() })]} />);
      expect(screen.getByText('Just now')).toBeInTheDocument();
    });

    it('shows a "No base address" badge only when baseLat is null', () => {
      const { rerender } = render(<InspectorTable data={[makeInspector({ baseLat: -33.8 })]} />);
      expect(screen.queryByText('No base address')).not.toBeInTheDocument();

      rerender(<InspectorTable data={[makeInspector({ baseLat: null })]} />);
      expect(screen.getByText('No base address')).toBeInTheDocument();
    });

    it('badge tooltip differs for a missing vs unlocatable address', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <InspectorTable data={[makeInspector({ baseLat: null, address: undefined })]} />,
      );
      await user.hover(screen.getByText('No base address').closest('[tabindex]')!);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Missing base address');

      rerender(
        <InspectorTable data={[makeInspector({ baseLat: null, address: { street: 'x' } })]} />,
      );
      await user.hover(screen.getByText('No base address').closest('[tabindex]')!);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Address could not be located');
    });

    it('App tooltip says "any device" and Push tooltip "last device seen"', async () => {
      const user = userEvent.setup();
      render(<InspectorTable data={[makeInspector()]} />);

      await user.hover(screen.getByText('Installed').closest('[tabindex]')!);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('any device');

      await user.hover(screen.getByText('On').closest('[tabindex]')!);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('last device seen');
    });

    it('Last seen tooltip reports the Sydney time and the 6 h throttle', async () => {
      const user = userEvent.setup();
      // TZ is pinned away from Sydney by the vitest config; the tooltip is still Sydney.
      render(<InspectorTable data={[makeInspector({ appLastSeenAt: '2026-03-01T00:00:00Z' })]} />);
      await user.hover(screen.getByText(/ago|Just now/).closest('[tabindex]')!);
      const tip = await screen.findByRole('tooltip');
      expect(tip).toHaveTextContent('(Sydney)');
      expect(tip).toHaveTextContent('reported at most every 6 h');
    });

    it('exposes App, Push and Last seen as sortable columns', () => {
      // Nulls-last ordering is enforced centrally by DataTable.compareValues; here
      // we only assert these columns opt into sorting (sortable header button).
      render(<InspectorTable data={[makeInspector()]} />);
      for (const label of ['App', 'Push', 'Last seen']) {
        expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
      }
    });
  });
});
