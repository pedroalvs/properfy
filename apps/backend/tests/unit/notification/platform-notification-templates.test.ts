import { describe, it, expect } from 'vitest';
import { PLATFORM_TEMPLATES } from '../../../src/scripts/platform-notification-templates';

/**
 * Payload keys the notify-stuck worker provides when creating an
 * INSPECTION_STUCK_ALERT notification (see notify-stuck.worker.ts).
 */
const STUCK_ALERT_PAYLOAD_KEYS = ['appointmentId', 'inspectorId', 'startedAt', 'hoursStuck'];

function extractVariables(content: string): string[] {
  return (content.match(/\{\{(\w+)\}\}/g) ?? []).map((v) => v.replace(/\{\{|\}\}/g, ''));
}

describe('PLATFORM_TEMPLATES seed data', () => {
  it('includes an EMAIL template for INSPECTION_STUCK_ALERT', () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'INSPECTION_STUCK_ALERT' && t.channel === 'EMAIL',
    );

    expect(entry).toBeDefined();
    expect(entry!.subject).toBeTruthy();
    expect(entry!.body).toBeTruthy();
  });

  it('INSPECTION_STUCK_ALERT only uses variables the notify-stuck worker provides', () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'INSPECTION_STUCK_ALERT' && t.channel === 'EMAIL',
    )!;

    const used = extractVariables(`${entry.subject ?? ''} ${entry.body}`);
    expect(used.length).toBeGreaterThan(0);
    for (const variable of used) {
      expect(STUCK_ALERT_PAYLOAD_KEYS).toContain(variable);
    }
  });

  it('INSPECTION_STUCK_ALERT is TRANSACTIONAL so an internal ops alert can never be consent-blocked', () => {
    const entry = PLATFORM_TEMPLATES.find(
      (t) => t.code === 'INSPECTION_STUCK_ALERT' && t.channel === 'EMAIL',
    )!;

    expect(entry.notificationClass).toBe('TRANSACTIONAL');
  });
});
