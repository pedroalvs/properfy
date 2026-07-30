import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationTargetChip } from './NotificationTargetChip';
import { NOTIFICATION_TARGETS } from '../types';

describe('NotificationTargetChip', () => {
  it('labels the rental tenant target as Tenant', () => {
    render(<NotificationTargetChip templateCode="INSPECTION_NOTICE" />);
    expect(screen.getByText('Tenant')).toBeInTheDocument();
  });

  it('labels the escalation target as Property Manager', () => {
    render(<NotificationTargetChip templateCode="PROPERTY_MANAGER_ESCALATION" />);
    expect(screen.getByText('Property Manager')).toBeInTheDocument();
  });

  it('labels inspector group templates as Inspector', () => {
    render(<NotificationTargetChip templateCode="INSPECTOR_GROUP_ASSIGNED" />);
    expect(screen.getByText('Inspector')).toBeInTheDocument();
  });

  it('labels report and password templates as User Account', () => {
    render(<NotificationTargetChip templateCode="REPORT_READY" />);
    expect(screen.getByText('User Account')).toBeInTheDocument();
  });

  it('labels the internal stuck alert as Properfy Ops', () => {
    render(<NotificationTargetChip templateCode="INSPECTION_STUCK_ALERT" />);
    expect(screen.getByText('Properfy Ops')).toBeInTheDocument();
  });

  it('resolves an SMS variant to the same target as its email counterpart', () => {
    render(<NotificationTargetChip templateCode="INSPECTION_NOTICE_SMS" />);
    expect(screen.getByText('Tenant')).toBeInTheDocument();
  });

  it('falls back to an em dash for a code outside both catalogs', () => {
    render(<NotificationTargetChip templateCode="SOME_CUSTOM_CODE" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('explains the actual recipient in the title attribute', () => {
    render(<NotificationTargetChip templateCode="PROPERTY_MANAGER_ESCALATION" />);
    expect(screen.getByText('Property Manager').getAttribute('title')).toContain('branch');
  });

  it('flags the ops alert as internal so it is not mistaken for customer-facing', () => {
    render(<NotificationTargetChip templateCode="INSPECTION_STUCK_ALERT" />);
    expect(screen.getByText('Properfy Ops').getAttribute('title')).toContain('internal');
  });

  it('gives every target a distinct style', () => {
    // One code per target. Comparing only two would let a duplicated colour among the
    // others slip through while the test still claimed to cover "each target".
    const oneCodePerTarget = [
      'INSPECTION_NOTICE', // RENTAL_TENANT
      'PROPERTY_MANAGER_ESCALATION', // PROPERTY_MANAGER
      'INSPECTOR_GROUP_ASSIGNED', // INSPECTOR
      'REPORT_READY', // USER_ACCOUNT
      'INSPECTION_STUCK_ALERT', // PLATFORM_OPS
    ];
    expect(oneCodePerTarget).toHaveLength(NOTIFICATION_TARGETS.length);

    const classNames = oneCodePerTarget.map(
      (templateCode) =>
        render(<NotificationTargetChip templateCode={templateCode} />).container.firstElementChild
          ?.className,
    );
    expect(new Set(classNames).size).toBe(oneCodePerTarget.length);
  });

  it('accepts a custom className', () => {
    render(<NotificationTargetChip templateCode="REPORT_READY" className="extra-class" />);
    expect(screen.getByText('User Account').className).toContain('extra-class');
  });
});
