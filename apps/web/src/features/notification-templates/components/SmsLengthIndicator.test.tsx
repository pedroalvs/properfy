import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { measureSmsTemplate, SAMPLE_DATA } from '@properfy/shared';
import { SmsLengthIndicator } from './SmsLengthIndicator';

function measure(body: string) {
  return measureSmsTemplate(body, SAMPLE_DATA);
}

describe('SmsLengthIndicator', () => {
  it('reports characters, encoding and a single part for a short GSM-7 body', () => {
    render(<SmsLengthIndicator measurement={measure('Hi {{rentalTenantName}}')} />);
    const status = screen.getByTestId('sms-length-indicator');
    expect(status).toHaveAttribute('role', 'status');
    expect(status.textContent).toContain('GSM-7');
    expect(status.textContent).toContain('/ 1530 characters');
    expect(status.textContent).toContain('1 part');
  });

  it('warns about billing when the body spans more than one part', () => {
    render(<SmsLengthIndicator measurement={measure('a'.repeat(200))} />);
    expect(screen.getByTestId('sms-length-indicator').textContent).toMatch(/Sends as 2 parts/);
  });

  it('warns when approaching the limit', () => {
    render(<SmsLengthIndicator measurement={measure('a'.repeat(1500))} />);
    expect(screen.getByTestId('sms-length-indicator').textContent).toMatch(/Approaching the 10-part limit/);
  });

  it('shows an over-limit error and cannot-be-saved message', () => {
    render(<SmsLengthIndicator measurement={measure('a'.repeat(1600))} />);
    expect(screen.getByTestId('sms-length-indicator').textContent).toMatch(/cannot be saved/);
  });

  it('shows the Unicode hint and 670 limit for UCS-2 bodies', () => {
    render(<SmsLengthIndicator measurement={measure('Olá {{rentalTenantName}} 😀')} />);
    const text = screen.getByTestId('sms-length-indicator').textContent ?? '';
    expect(text).toContain('Unicode (UCS-2)');
    expect(text).toContain('/ 670 characters');
  });
});
