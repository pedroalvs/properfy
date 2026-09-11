import { describe, it, expect } from 'vitest';
import { renderTemplateWithSamples } from './template-sample-render';

const VARS = {
  rentalTenantName: 'John Smith',
  propertyAddress: '123 Main St, Sydney NSW 2000',
  confirmationLink: 'https://app.properfy.me/portal/abc123',
  cancellationReason: '',
};

describe('renderTemplateWithSamples', () => {
  it('substitutes flat variables', () => {
    expect(renderTemplateWithSamples('Hi {{rentalTenantName}}', VARS)).toBe('Hi John Smith');
  });

  it('substitutes triple-brace (raw) variables', () => {
    expect(renderTemplateWithSamples('{{{confirmationLink}}}', VARS)).toBe(
      'https://app.properfy.me/portal/abc123',
    );
  });

  it('renders an unknown variable as empty string', () => {
    expect(renderTemplateWithSamples('x{{nope}}y', VARS)).toBe('xy');
  });

  it('honours ~ whitespace-control markers', () => {
    expect(renderTemplateWithSamples('a{{~ rentalTenantName ~}}b', VARS)).toBe('aJohn Smithb');
  });

  it('keeps the then-branch of an if when the value is present', () => {
    expect(renderTemplateWithSamples('{{#if rentalTenantName}}Hi {{rentalTenantName}}{{else}}Hello{{/if}}', VARS)).toBe(
      'Hi John Smith',
    );
  });

  it('keeps the else-branch of an if when the value is empty', () => {
    expect(renderTemplateWithSamples('{{#if cancellationReason}}Reason: {{cancellationReason}}{{else}}No reason{{/if}}', VARS)).toBe(
      'No reason',
    );
  });

  it('supports unless as the inverse of if', () => {
    expect(renderTemplateWithSamples('{{#unless cancellationReason}}none{{/unless}}', VARS)).toBe('none');
    expect(renderTemplateWithSamples('{{#unless rentalTenantName}}none{{/unless}}', VARS)).toBe('');
  });

  it('resolves nested if blocks innermost-first', () => {
    const tpl = '{{#if rentalTenantName}}A{{#if propertyAddress}}B{{/if}}C{{/if}}';
    expect(renderTemplateWithSamples(tpl, VARS)).toBe('ABC');
  });

  it('strips block and line comments, including any expressions inside them', () => {
    expect(renderTemplateWithSamples('a{{!-- {{rentalTenantName}} --}}b', VARS)).toBe('ab');
    expect(renderTemplateWithSamples('a{{! note }}b', VARS)).toBe('ab');
  });

  it('drops unsupported helper expressions (err short)', () => {
    expect(renderTemplateWithSamples('x{{formatDate scheduledDate}}y', VARS)).toBe('xy');
    expect(renderTemplateWithSamples('{{#each rows}}row{{/each}}', VARS)).toBe('row');
  });

  it('renders a real appointment-email conditional snippet', () => {
    // Shape used by the seeded appointment bodies (SERVICE_LABEL style).
    const tpl = 'Inspection at {{propertyAddress}}{{#if inspectorName}} with {{inspectorName}}{{/if}}.';
    expect(renderTemplateWithSamples(tpl, VARS)).toBe('Inspection at 123 Main St, Sydney NSW 2000.');
  });
});
