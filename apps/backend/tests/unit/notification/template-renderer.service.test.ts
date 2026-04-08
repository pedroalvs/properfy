import { describe, it, expect } from 'vitest';
import { TemplateRendererService } from '../../../src/modules/notification/domain/template-renderer.service';

describe('TemplateRendererService', () => {
  const service = new TemplateRendererService();

  describe('render()', () => {
    it('should replace known variables', () => {
      const result = service.render('Hello {{name}}, your appointment is on {{date}}.', {
        name: 'John',
        date: '2026-04-01',
      });
      expect(result).toBe('Hello John, your appointment is on 2026-04-01.');
    });

    it('should replace unknown variables with empty string', () => {
      const result = service.render('Hello {{name}}, ref: {{unknown}}.', {
        name: 'John',
      });
      expect(result).toBe('Hello John, ref: .');
    });

    it('should handle template with no variables', () => {
      const result = service.render('No variables here.', { name: 'John' });
      expect(result).toBe('No variables here.');
    });

    it('should handle empty variables map', () => {
      const result = service.render('Hello {{name}}.', {});
      expect(result).toBe('Hello .');
    });

    it('should handle multiple occurrences of same variable', () => {
      const result = service.render('{{name}} is {{name}}.', { name: 'John' });
      expect(result).toBe('John is John.');
    });

    it('should handle empty template', () => {
      const result = service.render('', { name: 'John' });
      expect(result).toBe('');
    });

    describe('HTML escaping', () => {
      it('should escape HTML entities by default with double braces', () => {
        const result = service.render('Hello {{name}}', {
          name: '<script>alert("xss")</script>',
        });
        expect(result).toBe('Hello &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      });

      it('should not escape HTML when using triple braces', () => {
        const result = service.render('Content: {{{htmlContent}}}', {
          htmlContent: '<strong>Bold</strong>',
        });
        expect(result).toBe('Content: <strong>Bold</strong>');
      });

      it('should escape ampersands and quotes', () => {
        const result = service.render('{{text}}', {
          text: 'A & B "quoted"',
        });
        expect(result).toBe('A &amp; B &quot;quoted&quot;');
      });
    });

    describe('conditionals', () => {
      it('should render content inside {{#if}} when variable is truthy', () => {
        const result = service.render(
          '{{#if primaryEmail}}Email: {{primaryEmail}}{{/if}}',
          { primaryEmail: 'john@example.com' },
        );
        expect(result).toBe('Email: john@example.com');
      });

      it('should not render content inside {{#if}} when variable is falsy', () => {
        const result = service.render(
          '{{#if primaryEmail}}Email: {{primaryEmail}}{{/if}}',
          { primaryEmail: '' },
        );
        expect(result).toBe('');
      });

      it('should not render content inside {{#if}} when variable is missing', () => {
        const result = service.render(
          '{{#if primaryEmail}}Email: {{primaryEmail}}{{/if}}',
          {},
        );
        expect(result).toBe('');
      });

      it('should render {{else}} block when condition is falsy', () => {
        const result = service.render(
          '{{#if confirmed}}Confirmed{{else}}Pending{{/if}}',
          { confirmed: false },
        );
        expect(result).toBe('Pending');
      });

      it('should support {{#unless}} for negated conditions', () => {
        const result = service.render(
          '{{#unless cancelled}}Active{{/unless}}',
          { cancelled: false },
        );
        expect(result).toBe('Active');
      });
    });

    describe('missing variables', () => {
      it('should render missing variable as empty string', () => {
        const result = service.render('Hello {{missingVar}}!', {});
        expect(result).toBe('Hello !');
      });

      it('should not throw for deeply nested missing variables', () => {
        const result = service.render('Hello {{person.name}}!', {});
        expect(result).toBe('Hello !');
      });
    });

    describe('formatDate helper', () => {
      it('should format date string with default format', () => {
        const result = service.render('Date: {{formatDate scheduledDate}}', {
          scheduledDate: '2026-04-15T10:30:00.000Z',
        });
        expect(result).toBe('Date: 2026-04-15');
      });

      it('should format date string with custom format', () => {
        const result = service.render('Date: {{formatDate scheduledDate "DD/MM/YYYY"}}', {
          scheduledDate: '2026-04-15T10:30:00.000Z',
        });
        expect(result).toBe('Date: 15/04/2026');
      });

      it('should format date string with time format', () => {
        const result = service.render('At: {{formatDate scheduledDate "HH:mm"}}', {
          scheduledDate: '2026-04-15T10:30:00.000Z',
        });
        expect(result).toMatch(/^At: \d{2}:\d{2}$/);
      });

      it('should handle Date objects', () => {
        const result = service.render('Date: {{formatDate scheduledDate "YYYY-MM-DD"}}', {
          scheduledDate: new Date('2026-04-15T10:30:00.000Z'),
        });
        expect(result).toBe('Date: 2026-04-15');
      });

      it('should return empty string for null/undefined date', () => {
        const result = service.render('Date: {{formatDate scheduledDate}}', {});
        expect(result).toBe('Date: ');
      });

      it('should return original value for invalid date', () => {
        const result = service.render('Date: {{formatDate scheduledDate}}', {
          scheduledDate: 'not-a-date',
        });
        expect(result).toBe('Date: not-a-date');
      });
    });

    describe('formatCurrency helper', () => {
      it('should format amount in BRL by default', () => {
        const result = service.render('Total: {{formatCurrency amount}}', {
          amount: 150.5,
        });
        expect(result).toContain('150,50');
        expect(result).toContain('R$');
      });

      it('should format amount with explicit currency', () => {
        const result = service.render('Total: {{formatCurrency amount "USD"}}', {
          amount: 150.5,
        });
        expect(result).toContain('150,50');
        expect(result).toContain('US$');
      });

      it('should handle string amounts', () => {
        const result = service.render('Total: {{formatCurrency amount}}', {
          amount: '250.75',
        });
        expect(result).toContain('250,75');
        expect(result).toContain('R$');
      });

      it('should return empty string for null/undefined amount', () => {
        const result = service.render('Total: {{formatCurrency amount}}', {});
        expect(result).toBe('Total: ');
      });

      it('should return original value for non-numeric amount', () => {
        const result = service.render('Total: {{formatCurrency amount}}', {
          amount: 'abc',
        });
        expect(result).toBe('Total: abc');
      });

      it('should handle zero amount', () => {
        const result = service.render('Total: {{formatCurrency amount}}', {
          amount: 0,
        });
        expect(result).toContain('0,00');
        expect(result).toContain('R$');
      });
    });
  });

  describe('extractVariables()', () => {
    it('should return unique list of variable names', () => {
      const result = service.extractVariables('Hello {{name}}, date: {{date}}.');
      expect(result).toEqual(['name', 'date']);
    });

    it('should return empty array for no variables', () => {
      const result = service.extractVariables('No variables here.');
      expect(result).toEqual([]);
    });

    it('should deduplicate variable names', () => {
      const result = service.extractVariables('{{name}} is {{name}} and {{date}}.');
      expect(result).toEqual(['name', 'date']);
    });

    it('should return empty array for empty template', () => {
      const result = service.extractVariables('');
      expect(result).toEqual([]);
    });

    it('should extract variables from conditionals', () => {
      const result = service.extractVariables(
        '{{#if primaryEmail}}Email: {{primaryEmail}}{{/if}}',
      );
      expect(result).toContain('primaryEmail');
    });

    it('should extract variables from helper params', () => {
      const result = service.extractVariables(
        '{{formatDate scheduledDate "DD/MM/YYYY"}}',
      );
      expect(result).toContain('scheduledDate');
    });

    it('should not include built-in helpers as variables', () => {
      const result = service.extractVariables(
        '{{#if show}}{{name}}{{/if}}',
      );
      expect(result).not.toContain('if');
      expect(result).toContain('show');
      expect(result).toContain('name');
    });

    it('should not include custom helpers as variables', () => {
      const result = service.extractVariables(
        '{{formatDate scheduledDate "YYYY-MM-DD"}} {{formatCurrency amount "BRL"}}',
      );
      expect(result).not.toContain('formatDate');
      expect(result).not.toContain('formatCurrency');
      expect(result).toContain('scheduledDate');
      expect(result).toContain('amount');
    });
  });

  describe('validateVariables()', () => {
    it('should return empty array when all variables are present', () => {
      const result = service.validateVariables(
        'Hello {{name}}, date: {{date}}.',
        { name: 'John', date: '2026-04-01' },
      );
      expect(result).toEqual([]);
    });

    it('should return missing variable names', () => {
      const result = service.validateVariables(
        'Hello {{name}}, date: {{date}}, ref: {{refCode}}.',
        { name: 'John' },
      );
      expect(result).toContain('date');
      expect(result).toContain('refCode');
      expect(result).not.toContain('name');
    });

    it('should return empty array for template with no variables', () => {
      const result = service.validateVariables('No variables here.', {});
      expect(result).toEqual([]);
    });

    it('should return empty array for empty template', () => {
      const result = service.validateVariables('', { name: 'John' });
      expect(result).toEqual([]);
    });

    it('should detect missing variables in conditionals', () => {
      const result = service.validateVariables(
        '{{#if primaryEmail}}Email: {{primaryEmail}}{{/if}} Name: {{name}}',
        { name: 'John' },
      );
      expect(result).toContain('primaryEmail');
    });

    it('should detect missing helper param variables', () => {
      const result = service.validateVariables(
        '{{formatDate scheduledDate "YYYY-MM-DD"}}',
        {},
      );
      expect(result).toContain('scheduledDate');
    });
  });
});
