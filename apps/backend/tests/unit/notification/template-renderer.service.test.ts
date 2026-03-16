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
  });
});
