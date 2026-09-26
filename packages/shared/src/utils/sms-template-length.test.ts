import { describe, it, expect } from 'vitest';
import { measureSmsTemplate, describeSmsOverLimit } from './sms-template-length';

const SAMPLES = {
  propertyAddress: '123 Main St, Sydney NSW 2000', // 28 chars
  agencyName: 'ABC Realty',
  reason: 'çãö', // forces UCS-2 when rendered
};

describe('measureSmsTemplate', () => {
  it('measures the RENDERED text, not the raw template', () => {
    // Raw body is 1503 + placeholder chars; rendered it is 1503 + 28 = 1531 > 1530.
    const body = 'a'.repeat(1503) + '{{propertyAddress}}';
    const m = measureSmsTemplate(body, SAMPLES);
    expect(m.rendered.length).toBe(1531);
    expect(m.overLimit).toBe(true);
    expect(m.encoding).toBe('GSM-7');
  });

  it('passes when the rendered text is exactly at the limit', () => {
    const body = 'a'.repeat(1502) + '{{propertyAddress}}'; // 1502 + 28 = 1530
    const m = measureSmsTemplate(body, SAMPLES);
    expect(m.rendered.length).toBe(1530);
    expect(m.overLimit).toBe(false);
  });

  it('flips to UCS-2 when a substituted sample value carries non-GSM characters', () => {
    const m = measureSmsTemplate('Reason: {{reason}}', SAMPLES);
    expect(m.encoding).toBe('UCS-2');
  });

  it('exposes the rendered body for inspection', () => {
    expect(measureSmsTemplate('Hi from {{agencyName}}', SAMPLES).rendered).toBe('Hi from ABC Realty');
  });
});

describe('describeSmsOverLimit', () => {
  it('states the length, limit and encoding', () => {
    const m = measureSmsTemplate('a'.repeat(1600), SAMPLES);
    const msg = describeSmsOverLimit(m);
    expect(msg).toContain('1600');
    expect(msg).toContain('1530');
    expect(msg).toContain('GSM-7');
  });

  it('labels UCS-2 as Unicode', () => {
    const m = measureSmsTemplate('á'.repeat(700), SAMPLES);
    expect(describeSmsOverLimit(m)).toContain('Unicode (UCS-2)');
  });
});
